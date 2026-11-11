/**
 * Parseur YAML minimaliste — repli sans dépendance du garde `check-manifest`.
 *
 * Limites assumées : indentation par espaces, suites « - », scalaires simples
 * ou quotés, blocs pliés « > » et littéraux « | », listes en flux « [a, b] ».
 * Pas d'ancres, pas d'alias, pas de documents multiples, pas de balises, pas
 * de lignes vides à l'intérieur d'un bloc scalaire. Suffisant pour le manifest
 * du dépôt — ce n'est pas un analyseur YAML général.
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */

/** Retire un commentaire « # … » hors guillemets. */
export function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** Découpe le texte en jetons {indent, text, raw}, commentaires et vides ôtés. */
export function tokenize(text) {
  const tokens = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    tokens.push({ indent, text: line.trim(), raw });
  }
  return tokens;
}

/** Enlève les guillemets simples ou doubles d'un scalaire. */
export function unquote(text) {
  const trimmed = text.trim();
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  if (trimmed.length > 1 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

/** Convertit un scalaire YAML en valeur JavaScript. */
export function parseScalar(text) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => parseScalar(item));
  }
  if (trimmed[0] === '"' || trimmed[0] === "'") return unquote(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d*\.\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Découpe « clé: valeur » — la clé s'arrête au premier « : » suivi d'un espace. */
export function splitKey(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      return { key: unquote(text.slice(0, i)), value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/** Lit un bloc scalaire « > » (plié) ou « | » (littéral) plus indenté. */
export function parseBlockScalar(tokens, index, parentIndent, style) {
  const base = index < tokens.length ? tokens[index].indent : parentIndent + 2;
  const parts = [];
  let cursor = index;
  while (cursor < tokens.length && tokens[cursor].indent > parentIndent) {
    const raw = tokens[cursor].raw;
    parts.push(raw.length > base ? raw.slice(base) : raw.trim());
    cursor += 1;
  }
  const joined = style === '>' ? parts.join(' ').trim() : parts.join('\n');
  return { value: joined, next: cursor };
}

/** Aiguille vers une suite ou une table selon le jeton courant. */
export function parseChild(tokens, index, parentIndent) {
  if (index >= tokens.length) return { value: null, next: index };
  const token = tokens[index];
  if (token.indent <= parentIndent) return { value: null, next: index };
  if (token.text.startsWith('- ')) return parseSequence(tokens, index, token.indent);
  return parseMapping(tokens, index, token.indent);
}

/** Lit une table YAML à l'indentation donnée. */
export function parseMapping(tokens, index, indent) {
  const map = {};
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.indent < indent) break;
    if (token.indent > indent) throw new Error(`indentation inattendue : « ${token.text} »`);
    if (token.text.startsWith('- ')) break;
    const split = splitKey(token.text);
    if (!split) throw new Error(`ligne illisible : « ${token.text} »`);
    index += 1;
    if (['>', '|', '>-', '|-'].includes(split.value)) {
      const block = parseBlockScalar(tokens, index, indent, split.value[0]);
      map[split.key] = block.value;
      index = block.next;
    } else if (split.value === '') {
      const child = parseChild(tokens, index, indent);
      map[split.key] = child.value;
      index = child.next;
    } else {
      map[split.key] = parseScalar(split.value);
    }
  }
  return { value: map, next: index };
}

/** Lit une suite YAML ; un item « - clé: … » ouvre une table imbriquée. */
export function parseSequence(tokens, index, indent) {
  const items = [];
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.indent !== indent || !token.text.startsWith('- ')) break;
    const inline = token.text.slice(2).trim();
    if (inline === '') {
      const child = parseChild(tokens, index + 1, indent);
      items.push(child.value);
      index = child.next;
      continue;
    }
    if (splitKey(inline)) {
      const merged = [{ indent: indent + 2, text: inline, raw: token.raw }, ...tokens.slice(index + 1)];
      const parsed = parseMapping(merged, 0, indent + 2);
      items.push(parsed.value);
      index += parsed.next;
      continue;
    }
    items.push(parseScalar(inline));
    index += 1;
  }
  return { value: items, next: index };
}

/** Point d'entrée : texte YAML → valeur JavaScript. */
export function parseMiniYaml(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return {};
  return parseChild(tokens, 0, -1).value;
}
