export const CSS = `
.signin {
  font-family: 'Inter', system-ui, sans-serif;
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
