import { AlertCircle, AlertTriangle } from 'lucide-react';
import { EntityLink } from '../../../components/EntityLink';
import { useNow } from '../../../hooks/useNow';
import { formatDate } from '../../../utils';
import { findingAge, type Finding } from '../lib/findings';

/**
 * What needs a look, one finding per line, errors in red. A finding leads to the page where
 * something can be done about it, and says below how long it has lasted where that is known.
 */
export const FindingList = ({ findings }: { findings: readonly Finding[] }) => {
    const now = useNow();
    return (
        <ul className="divide-y divide-border">
            {findings.map((finding) => {
                const isError = finding.severity === 'error';
                const Icon = isError ? AlertCircle : AlertTriangle;
                const age = findingAge(finding, now);
                return (
                    <li key={finding.id} className="flex items-start gap-3 px-4 py-3">
                        <Icon
                            size={16}
                            className={`mt-0.5 shrink-0 ${isError ? 'text-error' : 'text-warning'}`}
                            aria-label={finding.severity}
                        />
                        <div className="min-w-0">
                            {finding.to ? (
                                <EntityLink to={finding.to} className="text-sm text-text-primary break-words">
                                    {finding.text}
                                </EntityLink>
                            ) : (
                                <span className="text-sm text-text-primary break-words">{finding.text}</span>
                            )}
                            {age && (
                                <p
                                    className="mt-0.5 text-xs text-text-muted"
                                    title={finding.since ? `Since ${formatDate(finding.since)}` : undefined}
                                >
                                    {age}
                                </p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};
