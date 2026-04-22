import {ComponentChildren} from 'preact';

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

:root {
  --font-family-text: "Inter", sans-serif;
}

body {
  font-family: var(--font-family-text);
  background: #F5F5F5;
  padding: 40px 16px;
}

.root {
  max-width: 1200px;
  margin: 0 auto;
}

.root.align-center {
  text-align: center;
}

h1.title {
  margin-top: 0;
  margin-bottom: 24px;
}

p.message {
  margin-top: 0;
  margin-bottom: 0;
}

.box {
  font-size: 16px;
  line-height: 1.5;
  padding: 16px;
  border-radius: 12px;
  background: #ffffff;
}

pre.box {
  white-space: pre-wrap;
}

@media (min-width: 500px)  {
  body {
    padding: 40px;
  }

  .box {
    padding: 24px;
  }
}

@media (min-width: 1024px)  {
  body {
    padding: 100px;
  }
}
`;

export interface ErrorPageProps {
  code: number;
  title?: string;
  message?: string;
  children?: ComponentChildren;
  align?: 'center';
}

export function ErrorPage(props: ErrorPageProps) {
  const {code, message} = props;
  const title = props.title || code;
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: STYLES}}></style>
      <div className={`root align-${props.align || 'left'}`}>
        <h1 className="title">{title}</h1>
        {message && <p className="message">{message}</p>}
        {props.children}
      </div>
    </>
  );
}
