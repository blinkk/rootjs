import {Component, ComponentChildren} from 'preact';
import {DataLoadError} from '../DataLoadError/DataLoadError.js';

export interface AppErrorBoundaryProps {
  children?: ComponentChildren;
}

interface AppErrorBoundaryState {
  error: unknown;
}

/**
 * Error boundary wrapped around the app's router. If a route throws while
 * rendering, an error screen with a reload button is shown instead of a
 * blank screen with no recovery affordance.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {error: null};

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {error};
  }

  componentDidCatch(error: unknown) {
    console.error('error rendering route:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <DataLoadError title="Something went wrong" error={this.state.error} />
      );
    }
    return this.props.children;
  }
}
