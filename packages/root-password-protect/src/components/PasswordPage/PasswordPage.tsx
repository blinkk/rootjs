import {CSS} from './PasswordPage.css.js';

export interface PasswordPageProps {
  nonce: string;
  error?: string;
}

export function PasswordPage(props: PasswordPageProps) {
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
          nonce={props.nonce}
        />
        <style nonce={props.nonce}>{CSS}</style>
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
