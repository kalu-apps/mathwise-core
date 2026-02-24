import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Avatar, IconButton, Skeleton, Tooltip } from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import InsertPhotoRoundedIcon from "@mui/icons-material/InsertPhotoRounded";

import { getTeacherProfile, saveTeacherProfile } from "@/features/teacher-profile/api";
import { updateUserProfile } from "@/features/auth/model/api";
import { useAuth } from "@/features/auth/model/AuthContext";
import type { UserRole } from "@/entities/user/model/types";
import type {
  DiplomaFile,
  ExperienceItem,
  TeacherProfile as TeacherProfileData,
} from "@/features/teacher-profile/model/types";
import { fileToDataUrl } from "@/shared/lib/files";
import {
  PHONE_MASK_TEMPLATE,
  formatRuPhoneDisplay,
  formatRuPhoneInput,
  toRuPhoneStorage,
} from "@/shared/lib/phone";
import { PasswordSecurityCard } from "@/features/auth/ui/PasswordSecurityCard";

type ProfileData = TeacherProfileData;

type Props = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role?: UserRole;
  };
  readOnly?: boolean;
};

const createId = () =>
  typeof globalThis !== "undefined" &&
  "crypto" in globalThis &&
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2, 10)}`;

const makeEmptyProfile = (user: Props["user"]): ProfileData => ({
  firstName: user.firstName,
  lastName: user.lastName,
  about: "",
  experience: [],
  achievements: [],
  diplomas: [],
  photo: "",
});

const normalizeProfile = (
  user: Props["user"],
  raw: Partial<ProfileData>
): ProfileData => ({
  firstName:
    typeof raw.firstName === "string" && raw.firstName.trim()
      ? raw.firstName
      : user.firstName,
  lastName:
    typeof raw.lastName === "string" && raw.lastName.trim()
      ? raw.lastName
      : user.lastName,
  about: typeof raw.about === "string" ? raw.about : "",
  experience: Array.isArray(raw.experience)
    ? raw.experience.map((item) => ({
        id: item?.id ?? createId(),
        title: typeof item?.title === "string" ? item.title : "",
        place: typeof item?.place === "string" ? item.place : "",
        period: typeof item?.period === "string" ? item.period : "",
        description:
          typeof item?.description === "string" ? item.description : "",
      }))
    : [],
  achievements: Array.isArray(raw.achievements)
    ? raw.achievements.map((a) => (typeof a === "string" ? a : "")).slice(0, 50)
    : [],
  diplomas: Array.isArray(raw.diplomas)
    ? (raw.diplomas as DiplomaFile[])
        .filter((d) => d && typeof d === "object")
        .map((d): DiplomaFile => {
          const fileType: DiplomaFile["type"] =
            d.type === "pdf" ? "pdf" : "image";
          return {
            id: d.id ?? createId(),
            name: typeof d.name === "string" ? d.name : "Файл",
            type: fileType,
            dataUrl: typeof d.dataUrl === "string" ? d.dataUrl : "",
            addedAt:
              typeof d.addedAt === "string"
                ? d.addedAt
                : new Date().toISOString(),
          };
        })
        .filter((d) => d.dataUrl)
    : [],
  photo: typeof raw.photo === "string" ? raw.photo : "",
});

const loadProfile = async (user: Props["user"]): Promise<ProfileData> => {
  try {
    const parsed = await getTeacherProfile(user.id);
    return normalizeProfile(user, parsed);
  } catch {
    return makeEmptyProfile(user);
  }
};

const saveProfile = async (userId: string, profile: ProfileData) => {
  return saveTeacherProfile(userId, profile);
};

export function TeacherProfile({ user, readOnly = false }: Props) {
  const { user: authUser, updateUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData>(() =>
    makeEmptyProfile(user)
  );
  const [draft, setDraft] = useState<ProfileData | null>(null);
  const [phoneDraft, setPhoneDraft] = useState(user.phone ?? "");
  const [viewer, setViewer] = useState<DiplomaFile | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);

  const editing = !readOnly && draft !== null;
  const data = draft ?? profile;

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);

  const initials = `${data.firstName?.[0] ?? ""}${
    data.lastName?.[0] ?? ""
  }`.toUpperCase();
  const effectiveRole =
    authUser?.id === user.id ? authUser.role : (user.role ?? "teacher");
  const roleLabel = effectiveRole === "teacher" ? "Преподаватель" : "Студент";
  const displayPhone =
    authUser?.id === user.id ? (authUser.phone ?? "") : (user.phone ?? "");

  const achievementsView = editing
    ? data.achievements
    : data.achievements.filter((a) => a.trim().length > 0);

  const experienceView = editing
    ? data.experience
    : data.experience.filter((x) =>
        [x.title, x.place, x.period, x.description].some(
          (v) => v.trim().length > 0
        )
      );

  useEffect(() => {
    let active = true;
    void loadProfile(user).then((loaded) => {
      if (!active) return;
      setProfile(loaded);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const startEdit = () => {
    if (readOnly) return;
    setDraft({ ...profile });
    setPhoneDraft(displayPhone);
  };
  const cancelEdit = () => {
    setDraft(null);
    setPhoneDraft(displayPhone);
  };

  const commitEdit = async () => {
    if (!draft) return;
    const next = normalizeProfile(user, draft);
    const normalizedPhone = toRuPhoneStorage(phoneDraft);
    setProfile(next);
    try {
      await saveProfile(user.id, next);
      if (!readOnly) {
        const updatedUser = await updateUserProfile(user.id, {
          firstName: next.firstName,
          lastName: next.lastName,
          phone: normalizedPhone,
          photo: next.photo,
        });
        updateUser(updatedUser);
        setPhoneDraft(updatedUser.phone ?? normalizedPhone);
      }
      setDraft(null);
    } catch {
      // keep draft to allow retry
    }
  };

  const updateDraft = (patch: Partial<ProfileData>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!editing) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateDraft({ photo: dataUrl });
    e.target.value = "";
  };

  const handleAddDiplomas = async (files: FileList | File[]) => {
    if (!editing) return;
    const accepted = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (accepted.length === 0) return;

    const items: DiplomaFile[] = await Promise.all(
      accepted.map(async (file) => {
        const fileType: DiplomaFile["type"] =
          file.type === "application/pdf" ? "pdf" : "image";

        return {
          id: createId(),
          name: file.name,
          type: fileType,
          dataUrl: await fileToDataUrl(file),
          addedAt: new Date().toISOString(),
        };
      })
    );

    setDraft((prev) =>
      prev ? { ...prev, diplomas: [...prev.diplomas, ...items] } : prev
    );
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (!editing) return;
    await handleAddDiplomas(e.dataTransfer.files);
  };

  const removeDiploma = (id: string) => {
    if (!editing) return;
    setDraft((prev) =>
      prev
        ? { ...prev, diplomas: prev.diplomas.filter((d) => d.id !== id) }
        : prev
    );
  };

  const addExperience = () => {
    if (!editing) return;
    const item: ExperienceItem = {
      id: createId(),
      title: "",
      place: "",
      period: "",
      description: "",
    };
    setDraft((prev) =>
      prev ? { ...prev, experience: [...prev.experience, item] } : prev
    );
  };

  const updateExperience = (id: string, patch: Partial<ExperienceItem>) => {
    if (!editing) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            experience: prev.experience.map((item) =>
              item.id === id ? { ...item, ...patch } : item
            ),
          }
        : prev
    );
  };

  const removeExperience = (id: string) => {
    if (!editing) return;
    setDraft((prev) =>
      prev
        ? { ...prev, experience: prev.experience.filter((x) => x.id !== id) }
        : prev
    );
  };

  const addAchievement = () => {
    if (!editing) return;
    setDraft((prev) =>
      prev ? { ...prev, achievements: [...prev.achievements, ""] } : prev
    );
  };

  const updateAchievement = (index: number, value: string) => {
    if (!editing) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            achievements: prev.achievements.map((a, i) =>
              i === index ? value : a
            ),
          }
        : prev
    );
  };

  const removeAchievement = (index: number) => {
    if (!editing) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            achievements: prev.achievements.filter((_, i) => i !== index),
          }
        : prev
    );
  };

  if (loading) {
    return (
      <div className="tp2">
        <div className="tp2-container">
          <div className="tp2-layout">
            <aside className="tp2-sidebar">
              <section className="tp2-card tp2-profile">
                <Skeleton variant="rounded" height={112} />
                <Skeleton variant="rounded" height={36} />
              </section>
            </aside>
            <main className="tp2-content">
              <section className="tp2-card">
                <Skeleton variant="text" width="38%" height={34} />
                <Skeleton variant="rounded" height={110} />
              </section>
              <section className="tp2-card">
                <Skeleton variant="text" width="42%" height={34} />
                <Skeleton variant="rounded" height={140} />
              </section>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tp2">
      <div className="tp2-container">
        <div className="tp2-layout">
          <aside className="tp2-sidebar">
            <section className="tp2-card tp2-profile">
              {!readOnly && (
                <div className="tp2-profile-controls">
                  {!editing ? (
                    <Tooltip title="Редактировать профиль">
                      <IconButton
                        className="tp2-profile-control"
                        onClick={startEdit}
                        aria-label="Редактировать профиль"
                      >
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip title="Сохранить изменения">
                        <IconButton
                          className="tp2-profile-control tp2-profile-control--save"
                          onClick={() => void commitEdit()}
                          aria-label="Сохранить изменения профиля"
                        >
                          <SaveRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Отменить изменения">
                        <IconButton
                          className="tp2-profile-control"
                          onClick={cancelEdit}
                          aria-label="Отменить изменения профиля"
                        >
                          <CloseRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
              <div className="tp2-profile-main">
                <div className="tp2-avatar">
                  <Avatar
                    className="tp2-avatar-img"
                    src={data.photo}
                    variant="rounded"
                  >
                    {initials}
                  </Avatar>
                  {editing && (
                    <Tooltip title="Загрузить аватар">
                      <IconButton
                        className="tp2-avatar-edit"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={avatarInputRef}
                    onChange={handleAvatarChange}
                  />
                </div>

                <div className="tp2-name">
                  {editing ? (
                    <div className="tp2-name-inputs">
                      <input
                        value={data.firstName}
                        onChange={(e) =>
                          updateDraft({ firstName: e.target.value })
                        }
                        placeholder="Имя"
                      />
                      <input
                        value={data.lastName}
                        onChange={(e) =>
                          updateDraft({ lastName: e.target.value })
                        }
                        placeholder="Фамилия"
                      />
                    </div>
                  ) : (
                    <h2>
                      {data.firstName} {data.lastName}
                    </h2>
                  )}
                  <span className="tp2-role-chip">{roleLabel}</span>
                  <span className="tp2-email">{user.email}</span>
                  {editing ? (
                    <input
                      className="tp2-phone-input"
                      value={formatRuPhoneInput(phoneDraft)}
                      onChange={(e) =>
                        setPhoneDraft(formatRuPhoneInput(e.target.value))
                      }
                      placeholder={PHONE_MASK_TEMPLATE}
                      inputMode="tel"
                    />
                  ) : (
                    <span className="tp2-phone-text">
                      {formatRuPhoneDisplay(displayPhone) || "Телефон не указан"}
                    </span>
                  )}
                </div>
              </div>
              {!readOnly && authUser?.id === user.id && (
                <PasswordSecurityCard className="tp2-password-card" />
              )}
            </section>
          </aside>

          <main className="tp2-content">
            <section className="tp2-card">
              <div className="tp2-section-title">
                <h2>О себе</h2>
              </div>
              {editing ? (
                <textarea
                  value={data.about}
                  onChange={(e) => updateDraft({ about: e.target.value })}
                  placeholder="Кратко опишите подход к преподаванию, сильные стороны и методику."
                />
              ) : (
                <p>{data.about || "Информация не указана"}</p>
              )}
            </section>

            <section className="tp2-card">
              <div className="tp2-section-title">
                <h2>Опыт преподавания</h2>
                {editing && (
                  <button
                    className="tp2-btn tp2-btn-ghost"
                    onClick={addExperience}
                  >
                    <AddRoundedIcon fontSize="small" />
                    Добавить опыт
                  </button>
                )}
              </div>

              <div className="tp2-experience">
                {experienceView.length === 0 && !editing && (
                  <div className="tp2-empty">Информация не указана</div>
                )}

                {experienceView.map((item) => (
                  <div className="tp2-exp-card" key={item.id}>
                    {editing ? (
                      <>
                        <div className="tp2-exp-row">
                          <input
                            value={item.title}
                            placeholder="Должность / роль"
                            onChange={(e) =>
                              updateExperience(item.id, {
                                title: e.target.value,
                              })
                            }
                          />
                          <input
                            value={item.place}
                            placeholder="Организация"
                            onChange={(e) =>
                              updateExperience(item.id, {
                                place: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="tp2-exp-row">
                          <input
                            value={item.period}
                            placeholder="Период (например, 2020–2024)"
                            onChange={(e) =>
                              updateExperience(item.id, {
                                period: e.target.value,
                              })
                            }
                          />
                        </div>
                        <textarea
                          value={item.description}
                          placeholder="Краткое описание задач и достижений"
                          onChange={(e) =>
                            updateExperience(item.id, {
                              description: e.target.value,
                            })
                          }
                        />
                        <div className="tp2-exp-actions">
                          <IconButton onClick={() => removeExperience(item.id)}>
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="tp2-exp-header">
                          <h3>{item.title || "Без названия"}</h3>
                          <span>{item.period}</span>
                        </div>
                        <div className="tp2-exp-place">{item.place}</div>
                        <p>{item.description}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="tp2-card">
              <div className="tp2-section-title">
                <h2>Достижения</h2>
                {editing && (
                  <button
                    className="tp2-btn tp2-btn-ghost"
                    onClick={addAchievement}
                  >
                    <AddRoundedIcon fontSize="small" />
                    Добавить достижение
                  </button>
                )}
              </div>

              <div className="tp2-achievements">
                {achievementsView.length === 0 && !editing && (
                  <div className="tp2-empty">Информация не указана</div>
                )}

                {achievementsView.map((a, i) => (
                  <div className="tp2-achievement" key={`${a}-${i}`}>
                    {editing ? (
                      <>
                        <input
                          value={a}
                          placeholder="Например: подготовил 15 олимпиадников"
                          onChange={(e) => updateAchievement(i, e.target.value)}
                        />
                        <IconButton onClick={() => removeAchievement(i)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <span>{a}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="tp2-card">
              <div className="tp2-section-title">
                <h2>Дипломы и сертификаты</h2>
                {editing && (
                  <button
                    className="tp2-btn tp2-btn-ghost"
                    onClick={() => diplomaInputRef.current?.click()}
                  >
                    <UploadFileRoundedIcon fontSize="small" />
                    Добавить файлы
                  </button>
                )}
              </div>

              <div
                className={`tp2-dropzone ${dragActive ? "is-active" : ""} ${
                  editing ? "" : "is-disabled"
                }`}
                onDragOver={(e) => {
                  if (!editing) return;
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => editing && diplomaInputRef.current?.click()}
              >
                <UploadFileRoundedIcon />
                <div>
                  <strong>Перетащите файлы сюда</strong>
                  <span>или нажмите, чтобы выбрать</span>
                </div>
              </div>

              <div className="tp2-diplomas">
                {data.diplomas.length === 0 && !editing && (
                  <div className="tp2-empty">Информация не указана</div>
                )}

                {data.diplomas.map((d) => (
                  <div className="tp2-diploma" key={d.id}>
                    <button
                      className="tp2-diploma-preview"
                      onClick={() => setViewer(d)}
                    >
                      {d.type === "image" ? (
                        <>
                          <img src={d.dataUrl} alt={d.name} />
                          <span className="tp2-diploma-label">
                            <InsertPhotoRoundedIcon fontSize="small" />
                            {d.name}
                          </span>
                        </>
                      ) : (
                        <div className="tp2-diploma-pdf">
                          <PictureAsPdfRoundedIcon />
                          <span>{d.name}</span>
                        </div>
                      )}
                    </button>
                    {editing && (
                      <IconButton
                        className="tp2-diploma-remove"
                        onClick={() => removeDiploma(d.id)}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>

              <input
                type="file"
                hidden
                accept="image/*,application/pdf"
                multiple
                ref={diplomaInputRef}
                onChange={(e) => {
                  if (!e.target.files) return;
                  void handleAddDiplomas(e.target.files);
                  e.target.value = "";
                }}
              />
            </section>
          </main>
        </div>
      </div>

      {viewer && (
        <div className="tp2-viewer" onClick={() => setViewer(null)}>
          <div className="tp2-viewer-body" onClick={(e) => e.stopPropagation()}>
            <div className="tp2-viewer-header">
              <span>{viewer.name}</span>
              <button
                className="tp2-btn tp2-btn-ghost"
                onClick={() => setViewer(null)}
              >
                Закрыть
              </button>
            </div>
            {viewer.type === "image" ? (
              <img src={viewer.dataUrl} alt={viewer.name} />
            ) : (
              <iframe title={viewer.name} src={viewer.dataUrl} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
