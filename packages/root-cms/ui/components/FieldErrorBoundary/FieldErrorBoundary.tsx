import './FieldErrorBoundary.css';

import {IconAlertTriangle} from '@tabler/icons-preact';
import {Component, ComponentChildren, ErrorInfo} from 'preact';
import {ErrorReport, reportError} from '../../utils/error-reports.js';

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
        <div className="FieldErrorBoundary">
          <div className="FieldErrorBoundary__icon">
            <IconAlertTriangle size={16} />
          </div>
          <div className="FieldErrorBoundary__body">
            <div className="FieldErrorBoundary__title">
              This field failed to render.
            </div>
            <div className="FieldErrorBoundary__message">{message}</div>
            {this.state.report && (
              <div className="FieldErrorBoundary__id">
                Error ID: <span>{this.state.report.id}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
