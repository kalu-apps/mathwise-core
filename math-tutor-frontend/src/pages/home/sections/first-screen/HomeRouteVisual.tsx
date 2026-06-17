const routeSteps = ["Каталог", "Практика", "Разбор", "Результат"];

export function HomeRouteVisual() {
  return (
    <div className="home-first-screen__route-visual" aria-hidden="true">
      <div className="home-first-screen__route-stage">
        <div className="home-first-screen__route-plate">
          <div className="home-first-screen__route-plate-face">
            <svg
              className="home-first-screen__route-graph"
              viewBox="0 0 220 150"
              role="presentation"
              focusable="false"
            >
              <path className="home-first-screen__route-axis" d="M30 118H190" />
              <path className="home-first-screen__route-axis" d="M48 128V24" />
              <path
                className="home-first-screen__route-function"
                d="M37 103 C55 76 67 42 88 44 C111 47 113 115 136 112 C157 109 162 54 185 42"
              />
              <path className="home-first-screen__route-arrow" d="M180 36L191 42L180 50" />
              <path className="home-first-screen__route-arrow" d="M184 112L194 118L184 124" />
              <path className="home-first-screen__route-arrow" d="M42 30L48 20L54 30" />
            </svg>
          </div>
        </div>

        <div className="home-first-screen__route-coin">
          <span>π</span>
        </div>

        <div className="home-first-screen__route-path">
          <svg
            className="home-first-screen__route-line"
            viewBox="0 0 430 172"
            role="presentation"
            focusable="false"
          >
            <path
              className="home-first-screen__route-line-base"
              d="M42 118 C96 40 160 42 205 90 S302 153 386 54"
            />
            <path
              className="home-first-screen__route-line-active"
              d="M42 118 C96 40 160 42 205 90 S302 153 386 54"
            />
          </svg>

          {routeSteps.map((step, index) => (
            <div
              key={step}
              className={`home-first-screen__route-node home-first-screen__route-node--${
                index + 1
              }`}
            >
              <span className="home-first-screen__route-node-dot" />
              <span className="home-first-screen__route-node-label">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
