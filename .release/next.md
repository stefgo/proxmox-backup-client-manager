<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

### Wrapped text in tables sits closer

Text that wraps onto a second line in a table cell now sits as closely as text anywhere else
in the application; its lines were further apart than the text's size called for. Rows of a
single line are a little lower than before.

### Labels in the list view line up

In the list view, which shows each row as a card of labels and values, every value of a
row now starts at the same edge. A long label wraps instead of pushing its value aside, so
on a narrow screen it no longer runs out of the row.

### Upgrading

Nothing has to be done. The webhook template engine now comes from a package the stefgo
projects share, and the dependencies were brought up to date.
