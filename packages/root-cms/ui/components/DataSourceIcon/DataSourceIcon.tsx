import {IconTable, IconWorld} from '@tabler/icons-preact';
import {DataSourceType} from '../../utils/data-source.js';
import './DataSourceIcon.css';

export interface DataSourceIconProps {
  className?: string;
  type?: DataSourceType;
  size?: number;
}

/**
 * Renders a data source's type as an icon inside a rounded chip. Google Sheet
 * sources use a table icon, all other (http) sources use a globe icon.
 */
export function DataSourceIcon(props: DataSourceIconProps) {
  const size = props.size ?? 36;
  const iconSize = Math.round(size * 0.55);
  const className = props.className
    ? `DataSourceIcon ${props.className}`
    : 'DataSourceIcon';
  return (
    <div className={className} style={{width: `${size}px`, height: `${size}px`}}>
      {props.type === 'gsheet' ? (
        <IconTable size={iconSize} stroke={1.5} />
      ) : (
        <IconWorld size={iconSize} stroke={1.5} />
      )}
    </div>
  );
}
