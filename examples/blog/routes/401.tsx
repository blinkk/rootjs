import {PasswordPageProps} from '@blinkk/root-password-protect/plugin';

export default function NotAuthorizedPage(props: PasswordPageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Protected</title>
        <link
          rel="icon"
          href="https://lh3.googleusercontent.com/ijK50TfQlV_yJw3i-CMlnD6osH4PboZBILZrJcWhoNMEmoyCD5e1bAxXbaOPe5w4gG_Scf37EXrmZ6p8sP2lue5fLZ419m5JyLMs=e385-w256"
          type="image/png"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900"
          rel="stylesheet"
          nonce={props.nonce}
        />
        <style nonce={props.nonce}>
          {`
            body {
              font-family: system-ui, sans-serif;
              margin: 0;
              padding: 2rem;
            }

            .signin {
              max-width: 400px;
              margin: 0 auto;
            }

            .signin__form {
              display: flex;
              flex-direction: column;
              gap: 1rem;
              margin: 1rem 0;
            }

            .signin__form__password {
              padding: 0.5rem;
              border: 1px solid #ccc;
            }

            .signin__button {
              padding: 0.5rem;
              cursor: pointer;
            }
          `}
        </style>
      </head>
      <body>
        <div id="root">
          <div className="signin">
            <div className="signin__headline">
              <h1>This page is protected.</h1>
              <p className="signin__headline__body">
                Enter the password to continue:
              </p>
            </div>
            <form className="signin__form" method="POST">
              <input
                id="password"
                className="signin__form__password"
                name="password"
                type="password"
                placeholder="Password"
                autofocus={true}
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
