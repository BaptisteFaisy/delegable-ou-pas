/**
 * The small layout helpers every screen reuses (SPEC §16; SPEC §7 rule 7).
 *
 * They exist once so no screen reinvents them (zéro duplication): a section
 * title, a bullet list of lines, a label/value line. Mute components: they
 * display the strings the viewmodel produced, they decide nothing. Screens
 * compose their own `Stack` around these helpers.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Heading, List, ListItem, Stack, Text } from '@forge/react';

/** A section title (SPEC §16). */
export function SectionTitle(props: { readonly title: string }) {
  return <Heading as="h3">{props.title}</Heading>;
}

/** A bullet list of lines; an empty list renders nothing (SPEC §20). */
export function BulletList(props: { readonly items: readonly string[] }) {
  if (props.items.length === 0) return null;
  return (
    <List type="unordered">
      {props.items.map((item) => (
        <ListItem key={item}>
          <Text>{item}</Text>
        </ListItem>
      ))}
    </List>
  );
}

/** One label and its text on a line (SPEC §16). */
export function KeyValue(props: { readonly label: string; readonly value: string }) {
  return (
    <Stack space="space.0">
      <Text>{props.label}</Text>
      <Text>{props.value}</Text>
    </Stack>
  );
}
