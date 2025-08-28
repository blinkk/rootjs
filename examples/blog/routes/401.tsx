import {PasswordPageProps} from '@blinkk/root-password-protect/plugin';

function KeyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="icon icon-tabler icons-tabler-outline icon-tabler-key"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" />
      <path d="M15 9h.01" />
    </svg>
  );
}

export default function UnauthorizedPage(props: PasswordPageProps) {
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
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            #root {
              width: 100%;
              max-width: 400px;
              padding: 2rem;
            }

            .signin {
              background: white;
              border-radius: 16px;
              padding: 3rem 2.5rem;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
              text-align: center;
            }

            .signin__headline__icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 64px;
              height: 64px;
              background: linear-gradient(135deg, #667eea, #764ba2);
              border-radius: 50%;
              color: white;
              margin: 0 auto 1.5rem;
            }

            .signin__headline h1 {
              font-size: 1.75rem;
              font-weight: 700;
              color: #1a1a1a;
              margin-bottom: 0.5rem;
              line-height: 1.2;
            }

            .signin__headline__body {
              color: #6b7280;
              font-size: 1rem;
              margin-bottom: 2rem;
              line-height: 1.5;
            }

            .signin__form {
              display: flex;
              flex-direction: column;
              gap: 1.5rem;
            }

            .signin__form__password {
              width: 100%;
              padding: 1rem 1.25rem;
              border: 2px solid #e5e7eb;
              border-radius: 12px;
              font-size: 1rem;
              font-family: inherit;
              transition: all 0.2s ease;
              outline: none;
            }

            .signin__form__password:focus {
              border-color: #667eea;
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }

            .signin__button {
              width: 100%;
              padding: 1rem 1.25rem;
              background: linear-gradient(135deg, #667eea, #764ba2);
              border: none;
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.2s ease;
              outline: none;
            }

            .signin__button:hover {
              transform: translateY(-1px);
              box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
            }

            .signin__button:active {
              transform: translateY(0);
            }

            .signin__button__label {
              color: white;
              font-size: 1rem;
              font-weight: 600;
              font-family: inherit;
            }

            .signin__error {
              margin-top: 1.5rem;
              padding: 0.75rem 1rem;
              background: #fef2f2;
              color: #dc2626;
              border: 1px solid #fecaca;
              border-radius: 8px;
              font-size: 0.875rem;
            }

            @media (max-width: 480px) {
              #root {
                padding: 1rem;
              }
              
              .signin {
                padding: 2rem 1.5rem;
              }
              
              .signin__headline h1 {
                font-size: 1.5rem;
              }
            }
          `}
        </style>
      </head>
      <body>
        <div id="root">
          <div className="signin">
            <div className="signin__headline">
              <div className="signin__headline__icon">
                <KeyIcon />
              </div>
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
