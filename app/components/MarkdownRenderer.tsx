'use client';

import React from 'react';

// Inline formatting: bold, italic, code, links
const applyInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];
  // Split on bold, italic, inline code, and markdown links
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(processText(text.slice(lastIndex, match.index), `${keyPrefix}-t${idx}`));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${idx}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-i${idx}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c${idx}`} className="px-1.5 py-0.5 bg-zinc-100 text-zinc-800 rounded text-[0.85em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`${keyPrefix}-a${idx}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {match[2]}
        </a>
      );
    }
    lastIndex = tokenRe.lastIndex;
    idx++;
  }
  if (lastIndex < text.length) {
    nodes.push(processText(text.slice(lastIndex), `${keyPrefix}-tail`));
  }
  return nodes.length > 0 ? nodes : [text];
};

// Process plain text: linkify bare URLs
const processText = (text: string, key: string): React.ReactNode => {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={`${key}-u${m.index}`} href={m[0]} target="_blank" rel="noopener noreferrer"
        className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
        {m[0]}
      </a>
    );
    last = urlRe.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

// Extract and render fenced code blocks
const renderCodeBlock = (lang: string, code: string, key: string) => (
  <div key={key} className="my-3 rounded-lg overflow-hidden border border-zinc-200">
    {lang && (
      <div className="px-3 py-1 bg-zinc-100 text-zinc-500 text-xs font-mono border-b border-zinc-200">
        {lang}
      </div>
    )}
    <pre className="p-3 bg-zinc-50 overflow-x-auto text-sm font-mono leading-relaxed">
      <code>{code}</code>
    </pre>
  </div>
);

// Render a markdown table
const renderTable = (rows: string[][], key: string) => {
  if (rows.length === 0) return null;
  const header = rows[0];
  const body = rows.slice(2); // skip separator row
  return (
    <div key={key} className="my-3 overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-zinc-700">{cell.trim()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-zinc-100 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-zinc-600">{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = (content || '').split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const codeMatch = /^```(\w*)/.exec(line);
    if (codeMatch) {
      const lang = codeMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      elements.push(renderCodeBlock(lang, codeLines.join('\n'), `code-${keyCounter++}`));
      continue;
    }

    // Table (starts with |)
    if (line.trim().startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cells);
        i++;
      }
      elements.push(renderTable(tableRows, `table-${keyCounter++}`));
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Heading
    const h3 = /^###\s+(.+)/.exec(line);
    if (h3) {
      elements.push(<h3 key={`h3-${keyCounter++}`} className="text-base font-semibold mt-4 mb-2 text-zinc-900">{applyInline(h3[1], `h3-${keyCounter}`)}</h3>);
      i++;
      continue;
    }
    const h2 = /^##\s+(.+)/.exec(line);
    if (h2) {
      elements.push(<h2 key={`h2-${keyCounter++}`} className="text-lg font-semibold mt-5 mb-2 text-zinc-900">{applyInline(h2[1], `h2-${keyCounter}`)}</h2>);
      i++;
      continue;
    }
    const h1 = /^#\s+(.+)/.exec(line);
    if (h1) {
      elements.push(<h1 key={`h1-${keyCounter++}`} className="text-xl font-bold mt-6 mb-2 text-zinc-900">{applyInline(h1[1], `h1-${keyCounter}`)}</h1>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(<hr key={`hr-${keyCounter++}`} className="my-4 border-zinc-200" />);
      i++;
      continue;
    }

    // Ordered list
    const olMatch = /^(\d+)\.\s+(.+)/.exec(line);
    if (olMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\d+)\.\s+(.+)/.exec(lines[i]);
        if (m) {
          items.push(m[2]);
          i++;
        } else if (/^\s*$/.test(lines[i])) {
          i++;
          break;
        } else {
          break;
        }
      }
      elements.push(
        <ol key={`ol-${keyCounter++}`} className="list-decimal pl-5 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-zinc-700">{applyInline(item, `oli-${keyCounter}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Unordered list
    const ulMatch = /^[-*+]\s+(.+)/.exec(line);
    if (ulMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^[-*+]\s+(.+)/.exec(lines[i]);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (/^\s*$/.test(lines[i])) {
          i++;
          break;
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul-${keyCounter++}`} className="list-disc pl-5 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-zinc-700">{applyInline(item, `uli-${keyCounter}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${keyCounter++}`} className="my-3 pl-4 border-l-3 border-zinc-300 text-zinc-600 italic">
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="my-1">{applyInline(ql, `bqi-${keyCounter}-${qi}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|```|\|>|\d+\.\s|[-*+]\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]) && !lines[i].trim().startsWith('|')) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${keyCounter++}`} className="my-2 text-zinc-700 leading-relaxed">
          {applyInline(paraLines.join(' '), `para-${keyCounter}`)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}
