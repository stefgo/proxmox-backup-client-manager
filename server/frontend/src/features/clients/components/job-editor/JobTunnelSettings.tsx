import React from 'react';
import { useJobFormContext } from '../../context/JobFormContext';
import { Switch } from '@stefgo/react-ui-components';

/**
 * Whether this job reaches its repository through the client's SSH reverse tunnel.
 *
 * Per job, not per client, because one client can have both: a PBS on its own segment it
 * talks to directly, and one it only reaches through the detour the server opens for it.
 * The setting travels with the job into the agent's own config, which is what makes a
 * scheduled run offline take the route the operator chose.
 *
 * Without stored SSH credentials on the client there is nothing to switch on — the
 * backend rejects such a job anyway, so the control says so instead of letting the save
 * fail. The credentials live in the client editor; only the choice lives here.
 */
export const JobTunnelSettings: React.FC = () => {
    const { tunnelRequired, setTunnelRequired, tunnelAvailable } = useJobFormContext();

    return (
        <div className="space-y-1">
            <label className="block text-xs font-bold text-text-muted uppercase">
                SSH Reverse Tunnel
            </label>
            <div className="p-2 border rounded bg-app-bg">
                <Switch
                    value={tunnelAvailable && tunnelRequired}
                    onChange={setTunnelRequired}
                    disabled={!tunnelAvailable}
                    label={tunnelRequired && tunnelAvailable ? 'Enabled' : 'Disabled'}
                    hint={
                        tunnelAvailable
                            ? 'The server opens a reverse forward to this client for the run, and the backup reaches the PBS as 127.0.0.1.'
                            : 'No SSH credentials are stored for this client — set them up in the client editor first.'
                    }
                    classNames={{
                        label: 'text-xs font-bold text-text-muted uppercase cursor-pointer select-none',
                    }}
                />
            </div>
        </div>
    );
};
