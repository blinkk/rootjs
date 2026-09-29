import {ArticleSection} from '@/components/ArticleLayout/ArticleLayout.js';
import {
  ApiEntryPoint,
  ApiExport,
  ApiMember,
  CliCommand,
  CliOption,
  CliProgram,
} from '@/utils/reference-types.js';
import {LoadedReference, toAnchorId} from '@/utils/reference.js';
import {Markdown} from './Markdown.js';
import styles from './Reference.module.scss';

/**
 * Renders reference docs generated from the source code by
 * `scripts/generate_reference.ts`.
 */
export function Reference(props: {reference: LoadedReference}) {
  const reference = props.reference;
  if (reference.type === 'cli') {
    return (
      <>
        {reference.data.programs.map((program) => (
          <CliProgramSection program={program} />
        ))}
      </>
    );
  }
  return (
    <>
      {reference.data.packages.flatMap((pkg) =>
        pkg.entryPoints.map((entry) => (
          <ApiEntryPointSection entry={entry} version={pkg.version} />
        ))
      )}
    </>
  );
}

function CliProgramSection(props: {program: CliProgram}) {
  const program = props.program;
  return (
    <ArticleSection id={toAnchorId(program.bin)} title={program.bin}>
      <p className={styles.meta}>
        From <code>{program.packageName}</code> v{program.version}
      </p>
      {program.globalOptions.length > 0 && (
        <OptionsTable title="Global options" options={program.globalOptions} />
      )}
      {program.commands.map((command) => (
        <CliCommandEntry command={command} />
      ))}
    </ArticleSection>
  );
}

function CliCommandEntry(props: {command: CliCommand}) {
  const command = props.command;
  return (
    <div className={styles.entry} id={toAnchorId(command.name)}>
      <h3 className={styles.entryTitle}>
        <code>{command.name}</code>
        {command.aliases.length > 0 && (
          <span className={styles.aliases}>
            alias: {command.aliases.join(', ')}
          </span>
        )}
      </h3>
      {command.summary && (
        <p className={styles.summary}>{capitalize(command.summary)}</p>
      )}
      <Markdown className={styles.doc} text={command.description} />
      <pre className={styles.signature}>
        <code>{command.usage}</code>
      </pre>
      {command.arguments.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Argument</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {command.arguments.map((arg) => (
              <tr>
                <td>
                  <code>
                    {arg.required ? `<${arg.name}>` : `[${arg.name}]`}
                  </code>
                </td>
                <td>
                  {capitalize(arg.description) ||
                    (arg.required ? 'Required.' : 'Optional.')}
                  {arg.defaultValue && (
                    <>
                      {' '}
                      Default: <code>{arg.defaultValue}</code>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {command.options.length > 0 && <OptionsTable options={command.options} />}
      {command.examples.length > 0 && (
        <>
          <div className={styles.label}>Examples</div>
          <pre className={styles.signature}>
            <code>
              {command.examples.map((line) => `$ ${line}`).join('\n')}
            </code>
          </pre>
        </>
      )}
      {command.subcommands.map((sub) => (
        <CliCommandEntry command={sub} />
      ))}
    </div>
  );
}

function OptionsTable(props: {title?: string; options: CliOption[]}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{props.title || 'Option'}</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {props.options.map((option) => (
          <tr>
            <td>
              <code>{option.flags}</code>
            </td>
            <td>
              {capitalize(option.description)}
              {option.choices && (
                <>
                  {' '}
                  One of:{' '}
                  {option.choices.map((choice, i) => (
                    <>
                      {i > 0 && ', '}
                      <code>{choice}</code>
                    </>
                  ))}
                  .
                </>
              )}
              {option.defaultValue && (
                <>
                  {' '}
                  Default: <code>{option.defaultValue}</code>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApiEntryPointSection(props: {entry: ApiEntryPoint; version: string}) {
  const entry = props.entry;
  return (
    <ArticleSection id={toAnchorId(entry.importPath)} title={entry.importPath}>
      <pre className={styles.signature}>
        <code>{`import {…} from '${entry.importPath}';`}</code>
      </pre>
      <Markdown className={styles.doc} text={entry.doc} />
      {entry.exports.map((item) => (
        <ApiExportEntry item={item} importPath={entry.importPath} />
      ))}
    </ArticleSection>
  );
}

function ApiExportEntry(props: {item: ApiExport; importPath: string}) {
  const item = props.item;
  return (
    <div className={styles.entry} id={toAnchorId(props.importPath, item.name)}>
      <h3 className={styles.entryTitle}>
        <code>{item.name}</code>
        <span className={styles.kind}>{item.kind}</span>
      </h3>
      <ApiDocs item={item} />
      {item.members.length > 0 && (
        <details className={styles.members}>
          <summary>
            {item.kind === 'namespace' ? 'Exports' : 'Members'} (
            {item.members.length})
          </summary>
          {item.members.map((member) => (
            <div className={styles.member}>
              <ApiDocs item={member} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function ApiDocs(props: {item: ApiMember}) {
  const item = props.item;
  return (
    <>
      {item.signature && (
        <pre className={styles.signature}>
          <code>{item.signature}</code>
        </pre>
      )}
      {item.deprecated && (
        <p className={styles.deprecated}>
          Deprecated.
          {typeof item.deprecated === 'string' && ` ${item.deprecated}`}
        </p>
      )}
      <Markdown className={styles.doc} text={item.doc} />
      {item.examples.map((example) => (
        <pre className={styles.signature}>
          <code>{example}</code>
        </pre>
      ))}
    </>
  );
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
