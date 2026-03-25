import React from 'react';
import { Alert } from 'antd';

interface RenderBoundaryProps {
  children: React.ReactNode;
  title?: string;
}

interface RenderBoundaryState {
  hasError: boolean;
}

export class RenderBoundary extends React.Component<RenderBoundaryProps, RenderBoundaryState> {
  public constructor(props: RenderBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): RenderBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error): void {
    console.error('Render boundary captured UI error', error);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Alert
          type="warning"
          showIcon
          message={this.props.title ?? 'This section is temporarily unavailable.'}
        />
      );
    }

    return this.props.children;
  }
}
