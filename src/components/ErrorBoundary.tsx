import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Erro inesperado no aplicativo.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Gestão Verde ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F9F7] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold">Não foi possível carregar esta seção</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Ocorreu uma falha de conexão ou permissão ao sincronizar os dados da propriedade.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full min-h-[48px] px-4 py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
