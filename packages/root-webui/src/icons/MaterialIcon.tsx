interface MaterialIconProps {
  icon: string;
  style?: React.CSSProperties;
  size?: number;
  color?: string;
}

export function MaterialIcon(props: MaterialIconProps) {
  const style = props.style || {};
  if (props.size) {
    style.fontSize = props.size;
  }
  if (props.color) {
    style.color = props.color;
  }
  return (
    <div className="material-symbols-rounded" style={style}>
      {props.icon}
    </div>
  );
}
