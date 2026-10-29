import {IconAlertTriangle} from '@tabler/icons-preact';
import {Component, ComponentChildren, ErrorInfo} from 'preact';
import {ErrorReport, reportError} from '../../../logs/error-reports.js';

export interface FieldErrorBoundaryProps {
  /** The deepKey of the field being rendered, used for error reporting. */
  deepKey?: string;
  children?: ComponentChildren;
}

interface FieldErrorBoundaryState {
  error: Error | null;
  report: ErrorReport | null;
}

/**
 * Error boundary that isolates a single field in the doc editor. If a field
 * throws while rendering (e.g. because its stored value has an unexpected
 * type), the error is caught and an inline message is shown instead of
 * crashing the entire editor.
 */
export class FieldErrorBoundary extends Component<
  FieldErrorBoundaryProps,
  FieldErrorBoundaryState
> {
  state: FieldErrorBoundaryState = {error: null, report: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, errorInfo?: ErrorInfo) {
    console.error(
      `Error rendering field${
        this.props.deepKey ? ` "${this.props.deepKey}"` : ''
      }:`,
      error
    );
    const report = reportError(error, {
      source: 'field',
      componentStack: errorInfo?.componentStack,
    });
    this.setState({report});
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error instanceof Error
          ? this.state.error.message
          : String(this.state.error);
      return (
        <div className="FieldErrorBoundary flex items-start gap-2 rounded-sm border border-danger-line bg-danger-soft px-3 py-2.5 text-danger">
          <div className="FieldErrorBoundary__icon mt-px flex shrink-0 items-center">
            <IconAlertTriangle size={16} />
          </div>
          <div className="FieldErrorBoundary__body flex min-w-0 flex-col gap-0.5">
            <div className="FieldErrorBoundary__title text-sm font-semibold">
              This field failed to render.
            </div>
            <div className="FieldErrorBoundary__message break-words font-mono text-sm">
              {message}
            </div>
            {this.state.report && (
              <div className="FieldErrorBoundary__id text-sm opacity-80">
                Error ID:{' '}
                <span className="font-mono select-all">
                  {this.state.report.id}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
