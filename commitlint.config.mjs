export default {
    extends: ["@commitlint/config-conventional"],
    plugins: [
        {
            rules: {
                // Conventional Commits kennt zwei Schreibweisen fuer einen Breaking
                // Change: `feat!:` und die `BREAKING CHANGE:`-Fusszeile. Hier
                // funktioniert nur die zweite.
                //
                // semantic-release liest die Commits mit dem Angular-Preset, dessen
                // headerPattern lautet /^(\w*)(?:\((.*)\))?: (.*)$/ -- ohne `!`. Ein
                // `feat!: ...` faellt damit durch das Muster, wird als *typlos*
                // gelesen und loest gar kein Release aus. commitlint wuerde ihn
                // durchwinken, weil das Ausrufezeichen im Standard gueltig ist.
                //
                // Zweiter Grund: In diesem Projekt hebt ein Breaking Change die
                // Minor-Stelle (releaseRules in package.json). Ein `!` signalisiert
                // jedem Leser "Major" und behauptet damit etwas Falsches.
                "no-breaking-bang": ({ header }) => [
                    !/^[a-z]+(\([^)]*\))?!:/.test(header ?? ""),
                    'Das "!" loest hier kein Release aus (das Angular-Preset kennt es nicht). ' +
                        'Nutze stattdessen eine "BREAKING CHANGE:"-Fusszeile.',
                ],
            },
        },
    ],
    rules: {
        // Commit-Meldungen sind englisch (siehe CLAUDE.md) -- sie werden zu
        // CHANGELOG.md und den Release Notes, und die liest dieselbe Zielgruppe
        // wie docs/. Die Default-Regel verbietet sentence-case und wuerde damit
        // die natuerliche Form eines englischen Subjects ablehnen ("fix: Validate
        // the schedule when reading it"). Sie wuerde ausserdem die deutschen
        // Alt-Commits treffen, die nicht umgeschrieben werden. Der Typ ist das,
        // was ein Release ausloest - nicht die Schreibweise dahinter.
        "subject-case": [0],

        "no-breaking-bang": [2, "always"],
    },
};
