/**
 * Styles for the "bootstrap" screen (the "Loading..." placeholder and the
 * startup error screen) shown before the CMS UI renders.
 *
 * These are inlined into the page's `<head>` rather than shipped in the
 * external stylesheet so the screen is never unstyled, even when the
 * stylesheet is slow or fails to load. The rules are self-contained (they
 * don't rely on the external stylesheet's resets) and use the theme's CSS
 * variables where available, falling back to the defaults otherwise.
 */
export const BOOTSTRAP_CSS = `
body {
  margin: 0;
}

.bootstrap {
  box-sizing: border-box;
  font-family: var(--font-family-default, 'Inter', sans-serif);
  color: var(--color-text-default, #333333);
  font-size: 48px;
  font-weight: 900;
  line-height: 1.5;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px;
  gap: 8px;
  position: relative;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.bootstrap *,
.bootstrap *:before,
.bootstrap *:after {
  box-sizing: border-box;
}

.bootstrap h1,
.bootstrap p {
  margin: 0;
}

.bootstrap__loading {
  font-size: 36px;
  font-weight: 900;
}

.bootstrap-error {
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  position: absolute;
  bottom: 100px;
  left: 0;
  right: 0;
  text-align: center;
  animation: 0.5s forwards bootstrap-loading-error;
  animation-delay: 1s;
  opacity: 0;
  padding: 0 24px;
}

.bootstrap--error {
  gap: 16px;
}

.bootstrap__error-title {
  font-size: 48px;
  font-weight: 900;
  line-height: 1.1;
}

.bootstrap__error-message {
  color: #b00020;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  max-width: 640px;
}

.bootstrap__error-button {
  appearance: none;
  background: #1a1b1e;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  margin-top: 8px;
  padding: 10px 20px;
}

.bootstrap__error-button:hover {
  background: #333;
}

@keyframes bootstrap-loading-error {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
`;
