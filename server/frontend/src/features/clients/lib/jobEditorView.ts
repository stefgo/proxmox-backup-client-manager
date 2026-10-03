/**
 * What the editor's panel shows. One thing at a time: a list to pick from or a panel to
 * fill in takes the place of the form, and closes back into it. An index names the entry
 * that is changed; `null` adds one.
 */
export type JobEditorView =
    | { kind: 'form' }
    | { kind: 'client' }
    | { kind: 'repository' }
    | { kind: 'archive'; index: number | null }
    | { kind: 'exclude'; index: number | null };

export const JOB_FORM_VIEW: JobEditorView = { kind: 'form' };
