export function removeComments(sourceCode: string) {
  let output = '';
  let insideString = false;
  let insideComment = false;
  let stringChar = '';

  for (let i = 0; i < sourceCode.length; i++) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (insideComment) {
      if (char === '*' && nextChar === '/') {
        insideComment = false;
        i++;
      }
      continue;
    }

    if (insideString) {
      output += char;
      if (char === stringChar && sourceCode[i - 1] !== '\\') {
        insideString = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      i = sourceCode.indexOf('\n', i) - 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      insideComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      insideString = true;
      stringChar = char;
    }

    output += char;
  }

  return output;
}
