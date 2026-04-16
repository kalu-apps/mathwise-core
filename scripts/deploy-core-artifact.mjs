#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import dns from "node:dns";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const readPositiveInt = (value, fallback, cap) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, cap);
};

const readNonNegativeInt = (value, fallback, cap) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, cap);
};

const readBool = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const required = (value, label) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`missing_required_env:${label}`);
};

const parseRepo = (value) => {
  const raw = required(value, "DEPLOY_GH_REPO");
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) {
    throw new Error("invalid_repo_format_expected_owner_repo");
  }
  return { full: `${owner}/${repo}` };
};

const runShell = (command, args, cwd) => {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
  });
};

const commandExists = (command) => {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const extractZipArchive = (zipPath, outputDir, cwd) => {
  if (commandExists("unzip")) {
    runShell("unzip", ["-oq", zipPath, "-d", outputDir], cwd);
    return;
  }
  if (commandExists("python3")) {
    runShell(
      "python3",
      ["-c", "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zipPath, outputDir],
      cwd
    );
    return;
  }
  if (commandExists("python")) {
    runShell(
      "python",
      ["-c", "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zipPath, outputDir],
      cwd
    );
    return;
  }
  throw new Error("missing_zip_extractor:install_unzip_or_python3");
};

const verifyChecksum = (shaFilePath) => {
  const checksumDir = dirname(shaFilePath);
  const checksumFileName = basename(shaFilePath);
  if (commandExists("shasum")) {
    runShell("shasum", ["-a", "256", "-c", checksumFileName], checksumDir);
    return;
  }
  if (commandExists("sha256sum")) {
    runShell("sha256sum", ["-c", checksumFileName], checksumDir);
    return;
  }
  throw new Error("missing_checksum_tool:install_shasum_or_sha256sum");
};

const formatNetworkError = (error) => {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  const cause = error.cause;
  if (cause && typeof cause === "object") {
    const causeParts = [];
    if (typeof cause.code === "string") causeParts.push(`code=${cause.code}`);
    if (typeof cause.errno === "number" || typeof cause.errno === "string") {
      causeParts.push(`errno=${cause.errno}`);
    }
    if (typeof cause.syscall === "string") causeParts.push(`syscall=${cause.syscall}`);
    if (typeof cause.hostname === "string") causeParts.push(`host=${cause.hostname}`);
    if (typeof cause.address === "string") causeParts.push(`address=${cause.address}`);
    if (typeof cause.port === "number") causeParts.push(`port=${cause.port}`);
    if (causeParts.length > 0) {
      parts.push(`cause(${causeParts.join(",")})`);
    }
  }
  return parts.filter(Boolean).join(" | ");
};

const fetchWithRetry = async ({
  url,
  headers,
  timeoutMs,
  retries,
  retryDelayMs,
  label,
  acceptHeader,
}) => {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        headers: {
          ...headers,
          Accept: acceptHeader ?? "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "mathwise-core-artifact-deploy",
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error(`${label}_network_error:${formatNetworkError(lastError)}`);
};

const runJson = async ({ url, token, timeoutMs, retries, retryDelayMs }) => {
  const response = await fetchWithRetry({
    url,
    timeoutMs,
    retries,
    retryDelayMs,
    label: "github_api_fetch",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`github_api_error:${response.status}:${body.slice(0, 400)}`);
  }
  return response.json();
};

const ensureExists = (path, errorCode) => {
  if (!existsSync(path)) {
    throw new Error(errorCode);
  }
};

const run = async () => {
  const dryRun = readBool(process.env.DEPLOY_DRY_RUN, false);
  const token = required(process.env.DEPLOY_GH_TOKEN ?? process.env.GITHUB_TOKEN, "DEPLOY_GH_TOKEN");
  const repo = parseRepo(process.env.DEPLOY_GH_REPO ?? "kalu-apps/mathwise-core");
  const branch = String(process.env.DEPLOY_GH_BRANCH ?? "staging").trim();
  const workflow = String(process.env.DEPLOY_GH_WORKFLOW ?? "build-core-artifact.yml").trim();
  const artifactName = String(process.env.DEPLOY_GH_ARTIFACT_NAME ?? `core-runtime-${branch}`).trim();
  const explicitSha = String(process.env.DEPLOY_GH_SHA ?? "").trim().toLowerCase();
  const explicitRunIdRaw = String(process.env.DEPLOY_GH_RUN_ID ?? "").trim();
  const explicitRunId =
    explicitRunIdRaw.length > 0 ? Math.max(1, Number.parseInt(explicitRunIdRaw, 10)) : null;
  const timeoutMs = readPositiveInt(process.env.DEPLOY_GH_TIMEOUT_MS, 20_000, 120_000);
  const fetchRetries = readNonNegativeInt(process.env.DEPLOY_GH_FETCH_RETRIES, 2, 6);
  const fetchRetryDelayMs = readPositiveInt(process.env.DEPLOY_GH_FETCH_RETRY_DELAY_MS, 900, 10_000);
  const preferIpv4 = readBool(process.env.DEPLOY_FETCH_IPV4_FIRST, true);
  const workdir = resolve(process.env.DEPLOY_WORKDIR ?? process.cwd());

  if (preferIpv4 && typeof dns.setDefaultResultOrder === "function") {
    try {
      dns.setDefaultResultOrder("ipv4first");
    } catch {
      // Older Node runtimes may not support this API.
    }
  }

  const targetApiDistDir = resolve(workdir, process.env.DEPLOY_API_DIST_DIR ?? "apps/api/dist");
  const targetApiNodeModulesDir = resolve(
    workdir,
    process.env.DEPLOY_API_NODE_MODULES_DIR ?? "apps/api/node_modules"
  );
  const targetFrontendDistDir = resolve(
    workdir,
    process.env.DEPLOY_FRONTEND_DIST_DIR ?? "math-tutor-frontend/dist"
  );
  const targetApiPackageJsonPath = resolve(
    workdir,
    process.env.DEPLOY_API_PACKAGE_JSON_PATH ?? "apps/api/package.json"
  );
  const targetApiPackageLockPath = resolve(
    workdir,
    process.env.DEPLOY_API_PACKAGE_LOCK_PATH ?? "apps/api/package-lock.json"
  );
  const targetBuildInfoPath = resolve(
    workdir,
    process.env.DEPLOY_BUILD_INFO_PATH ?? ".deploy-core-build-info.json"
  );
  const metadataPath = resolve(
    workdir,
    process.env.DEPLOY_METADATA_PATH ?? ".deploy-core-artifact-meta.json"
  );

  const tempRoot = resolve(workdir, ".deploy-core-artifact-tmp");
  const tempZipPath = resolve(tempRoot, "artifact.zip");
  const extractedRoot = resolve(tempRoot, "artifact");
  const unpackRoot = resolve(tempRoot, "unpacked");
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });

  try {
    const base = `https://api.github.com/repos/${repo.full}`;
    const workflowPath = `${base}/actions/workflows/${encodeURIComponent(workflow)}`;
    let runInfo = null;

    if (explicitRunId) {
      runInfo = await runJson({
        url: `${base}/actions/runs/${explicitRunId}`,
        token,
        timeoutMs,
        retries: fetchRetries,
        retryDelayMs: fetchRetryDelayMs,
      });
    } else {
      const runsResponse = await runJson({
        url: `${workflowPath}/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=30`,
        token,
        timeoutMs,
        retries: fetchRetries,
        retryDelayMs: fetchRetryDelayMs,
      });
      const candidateRuns = Array.isArray(runsResponse.workflow_runs) ? runsResponse.workflow_runs : [];
      runInfo =
        candidateRuns.find((item) => {
          if (!item || item.conclusion !== "success") return false;
          if (!explicitSha) return true;
          return String(item.head_sha ?? "").toLowerCase() === explicitSha;
        }) ?? null;
    }

    if (!runInfo) {
      throw new Error("artifact_workflow_run_not_found");
    }
    if (explicitSha && String(runInfo.head_sha ?? "").toLowerCase() !== explicitSha) {
      throw new Error("artifact_run_sha_mismatch");
    }

    const artifactsResponse = await runJson({
      url: `${base}/actions/runs/${runInfo.id}/artifacts?per_page=100`,
      token,
      timeoutMs,
      retries: fetchRetries,
      retryDelayMs: fetchRetryDelayMs,
    });
    const artifact =
      (artifactsResponse.artifacts ?? []).find(
        (item) => item && item.name === artifactName && item.expired === false && Number.isFinite(item.id)
      ) ?? null;
    if (!artifact) {
      throw new Error(`artifact_not_found:${artifactName}`);
    }

    const archiveResponse = await fetchWithRetry({
      url: artifact.archive_download_url,
      timeoutMs,
      retries: fetchRetries,
      retryDelayMs: fetchRetryDelayMs,
      label: "artifact_download",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!archiveResponse.ok) {
      const body = await archiveResponse.text();
      throw new Error(`artifact_download_failed:${archiveResponse.status}:${body.slice(0, 300)}`);
    }

    const archiveBuffer = Buffer.from(await archiveResponse.arrayBuffer());
    writeFileSync(tempZipPath, archiveBuffer);

    mkdirSync(extractedRoot, { recursive: true });
    extractZipArchive(tempZipPath, extractedRoot, workdir);

    const runtimeTarPath = resolve(extractedRoot, "core-runtime.tgz");
    const runtimeShaPath = resolve(extractedRoot, "core-runtime.tgz.sha256");
    ensureExists(runtimeTarPath, "artifact_core_runtime_tgz_missing");
    ensureExists(runtimeShaPath, "artifact_core_runtime_sha_missing");

    verifyChecksum(runtimeShaPath);

    mkdirSync(unpackRoot, { recursive: true });
    runShell("tar", ["-xzf", runtimeTarPath, "-C", unpackRoot], workdir);

    const incomingApiDist = resolve(unpackRoot, "api/dist");
    const incomingApiNodeModules = resolve(unpackRoot, "api/node_modules");
    const incomingFrontendDist = resolve(unpackRoot, "frontend/dist");
    const incomingApiPackageJson = resolve(unpackRoot, "api/package.json");
    const incomingApiPackageLock = resolve(unpackRoot, "api/package-lock.json");
    const incomingBuildInfo = resolve(unpackRoot, "build-info.json");

    ensureExists(incomingApiDist, "artifact_api_dist_missing");
    ensureExists(incomingApiNodeModules, "artifact_api_node_modules_missing");
    ensureExists(incomingFrontendDist, "artifact_frontend_dist_missing");
    ensureExists(incomingApiPackageJson, "artifact_api_package_json_missing");
    ensureExists(incomingApiPackageLock, "artifact_api_package_lock_missing");

    const replacements = [
      { label: "api-dist", incoming: incomingApiDist, target: targetApiDistDir },
      { label: "api-node-modules", incoming: incomingApiNodeModules, target: targetApiNodeModulesDir },
      { label: "frontend-dist", incoming: incomingFrontendDist, target: targetFrontendDistDir },
    ];

    if (dryRun) {
      const dryRunPayload = {
        ok: true,
        dryRun: true,
        repo: repo.full,
        branch,
        workflow,
        artifactName,
        run: {
          id: runInfo.id,
          headSha: runInfo.head_sha,
          headBranch: runInfo.head_branch,
        },
        replacements: replacements.map((item) => ({ label: item.label, target: item.target })),
      };
      console.log(JSON.stringify(dryRunPayload, null, 2));
      return;
    }

    for (const item of replacements) {
      rmSync(`${item.target}.__prev`, { recursive: true, force: true });
    }

    const swapped = [];
    try {
      for (const item of replacements) {
        const backupPath = `${item.target}.__prev`;
        if (existsSync(item.target)) {
          renameSync(item.target, backupPath);
        }
        renameSync(item.incoming, item.target);
        swapped.push({ ...item, backupPath });
      }
      for (const item of swapped) {
        rmSync(item.backupPath, { recursive: true, force: true });
      }
    } catch (error) {
      for (const item of swapped.reverse()) {
        if (existsSync(item.target)) {
          rmSync(item.target, { recursive: true, force: true });
        }
        if (existsSync(item.backupPath)) {
          renameSync(item.backupPath, item.target);
        }
      }
      throw error;
    }

    copyFileSync(incomingApiPackageJson, targetApiPackageJsonPath);
    copyFileSync(incomingApiPackageLock, targetApiPackageLockPath);
    if (existsSync(incomingBuildInfo)) {
      copyFileSync(incomingBuildInfo, targetBuildInfoPath);
    }

    let buildInfo = null;
    if (existsSync(incomingBuildInfo)) {
      try {
        buildInfo = JSON.parse(readFileSync(incomingBuildInfo, "utf-8"));
      } catch {
        buildInfo = null;
      }
    }

    const metadata = {
      repo: repo.full,
      branch,
      workflow,
      artifactName,
      appliedAt: new Date().toISOString(),
      run: {
        id: runInfo.id,
        htmlUrl: runInfo.html_url,
        headSha: runInfo.head_sha,
        headBranch: runInfo.head_branch,
        event: runInfo.event,
      },
      buildInfo,
      replacements: replacements.map((item) => ({ label: item.label, target: item.target })),
    };
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...metadata }, null, 2));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(2);
});
