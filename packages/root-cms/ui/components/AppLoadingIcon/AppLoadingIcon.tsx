export function AppLoadingIcon() {
  return (
    <div className="AppLoadingIcon">
      <div className="AppLoadingIcon__Image">
        <svg
          width="144"
          height="144"
          viewBox="0 -4 150 150"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform="translate(19.5, 0)">
            <path
              d="M43.501 31.9896C8.97803 36.6155 -7.87914 128.208 5.28046 139.619C27.4742 158.863 108.233 99.2194 101.143 64.6793C98.3687 43.7086 68.7776 26.5971 43.501 31.9896Z"
              fill="none"
              stroke="black"
              stroke-width="1.5"
              stroke-linecap="round"
              style="--path-length: 333;"
              stroke-dasharray="333"
              stroke-dashoffset="333"
            >
              <animate
                attributeName="stroke-dashoffset"
                values="333; 0; 0; -333"
                dur="2s"
                repeatCount="indefinite"
                keyTimes="0; 0.25; 0.75; 1"
              />
            </path>
            <path
              d="M88.6545 0.425248C78.9389 1.72022 74.1946 27.3602 77.8983 30.5544C84.1438 35.9414 106.872 19.2452 104.876 9.57618C104.096 3.70577 95.7681 -1.08427 88.6545 0.425248Z"
              fill="none"
              stroke="black"
              stroke-width="1.5"
              stroke-linecap="round"
              style="--path-length: 160;"
              stroke-dasharray="160"
              stroke-dashoffset="160"
            >
              <animate
                attributeName="stroke-dashoffset"
                values="160; 0; 0; -160"
                dur="2s"
                repeatCount="indefinite"
                keyTimes="0; 0.25; 0.75; 1"
              />
            </path>
          </g>
        </svg>
      </div>
      <div className="AppLoadingIcon__Error">
        If this page fails to load, try a force refresh by holding the shift key
        while refreshing the page.
      </div>
    </div>
  );
}
