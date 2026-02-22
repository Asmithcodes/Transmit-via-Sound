import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,76,76,0.1)_0,transparent_50%)]"></div>

                    <div className="glass-panel p-8 max-w-lg w-full z-10 flex flex-col items-center text-center space-y-6">
                        <div className="w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center text-danger">
                            <AlertCircle size={32} />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-white tracking-tight">System Desynchronization</h1>
                            <p className="text-textMuted text-sm">
                                A critical error occurred in the visual or operational layer.
                            </p>
                        </div>

                        {this.state.error && (
                            <div className="w-full bg-black/40 rounded-lg p-4 text-left overflow-x-auto border border-white/5">
                                <code className="text-xs text-danger/80 font-mono">
                                    {this.state.error.message}
                                </code>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="glass-button w-full flex items-center justify-center gap-2 group hover:border-danger/30"
                        >
                            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                            <span>Reinitialize Sequence</span>
                        </button>

                        <a href="mailto:asmyth@duck.com" className="text-xs text-textMuted hover:text-white transition-colors">
                            System Error? Contact Asmith — asmyth@duck.com
                        </a>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
