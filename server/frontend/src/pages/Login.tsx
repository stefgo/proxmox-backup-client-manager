import { useState, FormEvent, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const [searchParams] = useSearchParams();
    const [authType, setAuthType] = useState<'local' | 'oidc' | null>(null);

    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            login(token);
        }
    }, [searchParams, login]);

    useEffect(() => {
        fetch('/api/auth/config')
            .then(res => res.json())
            .then(data => setAuthType(data.type))
            .catch(() => setAuthType('local'));
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Login failed');

            login(data.token);
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOidcLogin = () => {
        window.location.href = '/api/auth/login';
    };

    if (authType === null) {
        return <div className="min-h-screen bg-[#121212] flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#121212] p-4 text-[#e0e0e0] font-sans">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#2a2a2a] via-[#121212] to-[#000000] opacity-50 z-0"></div>

            <div className="w-full max-w-md bg-[#1e1e1e] rounded-xl shadow-2xl border border-[#333] relative z-10 overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-[#E54D0D] to-[#ff7f40]"></div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#333] mb-4 shadow-inner">
                            <Lock className="w-8 h-8 text-[#E54D0D]" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-white">Proxmox Backup</h2>
                        <p className="text-[#888] text-sm mt-1 uppercase tracking-widest font-semibold">Client Manager</p>
                    </div>

                    {authType === 'oidc' ? (
                        <div className="space-y-6">
                            <div className="bg-[#252525] border border-[#333] rounded-lg p-6 text-center">
                                <ShieldCheck className="w-12 h-12 text-[#E54D0D] mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-white mb-2">Single Sign-On Enabled</h3>
                                <p className="text-[#888] text-sm mb-6">Please log in using your identity provider.</p>

                                <button
                                    onClick={handleOidcLogin}
                                    className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-[#E54D0D] hover:bg-[#ff5f1f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#E54D0D] transition-all shadow-lg hover:shadow-[#E54D0D]/20 active:scale-[0.98]"
                                >
                                    Login with OIDC
                                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-900/20 border border-red-800/50 text-red-200 text-sm p-4 rounded-lg flex items-start gap-3 animate-pulse-soft">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="group">
                                    <label className="block text-xs font-semibold text-[#888] uppercase mb-1.5 ml-1 group-focus-within:text-[#E54D0D] transition-colors">Username</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <User className="h-5 w-5 text-[#555] group-focus-within:text-[#E54D0D] transition-colors" />
                                        </div>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-2.5 bg-[#252525] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#E54D0D]/50 focus:border-[#E54D0D] transition-all sm:text-sm"
                                            placeholder="Enter your username"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="group">
                                    <label className="block text-xs font-semibold text-[#888] uppercase mb-1.5 ml-1 group-focus-within:text-[#E54D0D] transition-colors">Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-[#555] group-focus-within:text-[#E54D0D] transition-colors" />
                                        </div>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-2.5 bg-[#252525] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#E54D0D]/50 focus:border-[#E54D0D] transition-all sm:text-sm"
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-[#E54D0D] hover:bg-[#ff5f1f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#E54D0D] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-[#E54D0D]/20 active:scale-[0.98]"
                            >
                                {isLoading ? 'Signing in...' : 'Sign in to Dashboard'}
                                {!isLoading && <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            <div className="absolute bottom-6 text-[#444] text-xs">
                © {new Date().getFullYear()} Proxmox Server Solutions GmbH. Unofficial Client Manager.
            </div>
        </div>
    );
}
