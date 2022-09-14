import {h} from 'preact';

export interface ErrorPageProps {
  error: unknown;
}

export function ErrorPage(props: ErrorPageProps) {
  const error = props.error;

  let message = undefined;
  if (import.meta.env.DEV) {
    if (error instanceof Error) {
      message = error.stack;
    } else {
      message = String(error);
    }
  }

  return (
    <div>
      <div>
        <p>An error occured during route handling or page rendering.</p>
        {message && <pre>{message}</pre>}
      </div>
    </div>
  );
}
