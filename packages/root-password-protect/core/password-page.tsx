import crypto from 'node:crypto';
import {Request, Response} from '@blinkk/root';
import {render as renderToString} from 'preact-render-to-string';

const CSS = `
.signin {
  font-family: 'Google Sans', arial, sans-serif;
  text-align: center;
  padding: 48px 20px;
  color: #3c4043;
}

.signin__headline {
  margin-bottom: 40px;
}

.signin__headline__icon {
  margin-bottom: 20px;
}

.signin__headline__icon svg {
  width: 72px;
  height: 72px;
}

.signin__headline__title {
  font-size: 36px;
  line-height: 1.3;
  font-weight: 500;
  margin-bottom: 20px;
}

.signin__headline__body {
  font-size: 18px;
  line-height: 1.5;
  font-weight: 500;
}

.signin__form {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.signin__form__password {
  box-sizing: border-box;
  border: 1px solid #dadce0;
  border-radius: 4px;
  height: 40px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  letter-spacing: .25px;
  padding: 0 12px;
  min-width: 250px;
  transition: all 0.218s ease;
}

.signin__form__password:focus {
  border-color: #d2e3fc;
  background-color: rgba(66, 133, 244, 0.04);
}

.signin__button {
  align-items: center;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 8px 11px;
  background: white;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  padding: 0 12px;
  height: 40px;
  box-sizing: border-box;
  transition: all 0.218s ease;
}

.signin__button:hover {
  border-color: #d2e3fc;
  background-color: rgba(66, 133, 244, 0.04);
}

.signin__button__icon {
  width: 18px;
  height: 18px;
  background-color: white;
}

.signin__button__label {
  font-size: 14px;
  line-height: 1;
  letter-spacing: .25px;
  font-weight: 500;
  color: #3c4043;
}

.signin__error {
  color: red;
  font-weight: bold;
  text-align: center;
  max-width: 60ch;
  margin: 20px auto 0;
}
`;

interface PasswordPageProps {
  error?: string;
}

function PasswordPage(props: PasswordPageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Protected</title>
        <link
          rel="icon"
          href="https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256"
          type="image/png"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&display=swap"
          nonce="{NONCE}"
        />
        <style nonce="{NONCE}">{CSS}</style>
      </head>
      <body>
        <div id="root">
          <div className="signin">
            <div className="signin__headline">
              <div className="signin__headline__icon">
                <ShieldIcon />
              </div>
              <h1>This page is protected.</h1>
              <p className="signin__headline__body">
                Enter the password below to continue:
              </p>
            </div>
            <form className="signin__form" method="POST">
              <input
                id="password"
                className="signin__form__password"
                name="password"
                type="password"
                placeholder="Password"
              />
              <button className="signin__button" type="submit">
                <div className="signin__button__label">Submit</div>
              </button>
            </form>
            {props.error && <p className="signin__error">{props.error}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}

function ShieldIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="icon icon-tabler icon-tabler-shield-lock-filled"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="#ff4500"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path
        d="M11.998 2l.118 .007l.059 .008l.061 .013l.111 .034a.993 .993 0 0 1 .217 .112l.104 .082l.255 .218a11 11 0 0 0 7.189 2.537l.342 -.01a1 1 0 0 1 1.005 .717a13 13 0 0 1 -9.208 16.25a1 1 0 0 1 -.502 0a13 13 0 0 1 -9.209 -16.25a1 1 0 0 1 1.005 -.717a11 11 0 0 0 7.531 -2.527l.263 -.225l.096 -.075a.993 .993 0 0 1 .217 -.112l.112 -.034a.97 .97 0 0 1 .119 -.021l.115 -.007zm.002 7a2 2 0 0 0 -1.995 1.85l-.005 .15l.005 .15a2 2 0 0 0 .995 1.581v1.769l.007 .117a1 1 0 0 0 1.993 -.117l.001 -1.768a2 2 0 0 0 -1.001 -3.732z"
        stroke-width="0"
        fill="currentColor"
      />
    </svg>
  );
}

export async function renderPasswordPage(
  req: Request,
  res: Response,
  props?: PasswordPageProps
) {
  const nonce = generateNonce();
  const mainHtml = renderToString(<PasswordPage {...props} />).replaceAll(
    '{NONCE}',
    nonce
  );
  const html = `<!doctype html>\n${mainHtml}`;
  res.setHeader('Content-Type', 'text/html');
  setSecurityHeaders(res, nonce);
  res.send(html);
}

function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

function setSecurityHeaders(res: Response, nonce: string) {
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader(
    'strict-transport-security',
    'max-age=63072000; includeSubdomains; preload'
  );
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-xss-protection', '1; mode=block');

  const directives = [
    "base-uri 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
  ];
  res.setHeader('content-security-policy-report-only', directives.join(';'));
}
