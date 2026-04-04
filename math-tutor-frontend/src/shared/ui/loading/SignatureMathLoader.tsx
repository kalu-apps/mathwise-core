type SignatureMathLoaderProps = {
  className?: string;
  percent?: number;
};

export function SignatureMathLoader({
  className,
  percent = 0,
}: SignatureMathLoaderProps) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className={["ui-signature-math-loader", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      data-loader="signature-math"
    >
      <div className="ui-signature-math-loader__surface">
        <div className="ui-signature-math-loader__formula ui-signature-math-loader__formula--full">
          <span className="ui-signature-math-loader__formula-main">
            lim
            <span className="ui-signature-math-loader__formula-sub">x→0</span>
            <span className="ui-signature-math-loader__formula-frac">sin x⁄x</span>
            <span className="ui-signature-math-loader__formula-plus"> + </span>
            <span className="ui-signature-math-loader__formula-int">∫₀^π sin x dx</span>
          </span>
        </div>

        <div className="ui-signature-math-loader__formula ui-signature-math-loader__formula--simplified">
          <span className="ui-signature-math-loader__formula-main">1 + 2</span>
        </div>

        <div className="ui-signature-math-loader__formula ui-signature-math-loader__formula--done">
          <span className="ui-signature-math-loader__formula-main">100%</span>
        </div>
      </div>
      <div className="ui-signature-math-loader__percent">{safePercent}%</div>
    </div>
  );
}

