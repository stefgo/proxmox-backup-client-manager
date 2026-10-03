import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider, ToastProvider } from '@stefgo/react-ui-components';

import { ThemeProvider } from './context/ThemeProvider';
import { AuthProvider } from '../auth/AuthProvider';
import { WebSocketProvider } from './context/WebSocketProvider';
import { queryClient } from '../../lib/queryClient';
import { router } from './router';

function App() {
    return (
        <ThemeProvider>
            {/* Outside the session: the cache outlives a login, and AuthProvider empties
                it on logout. */}
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <WebSocketProvider>
                        {/* Every page asks through useConfirm() and reports through useToast();
                            the one dialog and the one toast stack that answer live here. */}
                        <ToastProvider>
                            <ConfirmProvider>
                                {/* The providers above sit outside the router and use none
                                    of its hooks; what needs the location lives in a route. */}
                                <RouterProvider router={router} />
                            </ConfirmProvider>
                        </ToastProvider>
                    </WebSocketProvider>
                </AuthProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

export default App;
