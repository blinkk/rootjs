import {Component, ComponentChildren, ErrorInfo} from 'preact';
import {DataLoadError} from '../../components/DataLoadError/DataLoadError.js';
import {ErrorReport, reportError} from '../../features/logs/error-reports.js';

export interface AppErrorBoundaryProps {
  children?: ComponentChildren;
}

interface AppErrorBoundaryState {
  error: unknown;
  report: ErrorReport | null;
}

/**
 * Error boundary wrapped around the app's router. If a route throws while
 * rendering, an error screen with a reload button is shown instead of a
 * blank screen with no recovery affordance. The error is saved to the error
 * log, and the screen shows its id so the user can pass it to a developer.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {error: null, report: null};

  static getDerivedStateFromError(error: unknown) {
    return {error};
  }

  componentDidCatch(error: unknown, errorInfo?: ErrorInfo) {
    console.error('error rendering route:', error);
    const report = reportError(error, {
      source: 'render',
      componentStack: errorInfo?.componentStack,
    });
    this.setState({report});
  }

  render() {
    if (this.state.error) {
      return (
        <DataLoadError
          title="Something went wrong"
          body="This page ran into an unexpected error. Reload the page to try again."
          error={this.state.report ? undefined : this.state.error}
          report={this.state.report || undefined}
        />
      );
    }
    return this.props.children;
  }
}
