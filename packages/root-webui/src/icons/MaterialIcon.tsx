interface MaterialIconProps {
  icon: string;
  style?: React.CSSProperties;
}

export function MaterialIcon(props: MaterialIconProps) {
  return (
    <div className="material-symbols-rounded" style={props.style}>
      {props.icon}
    </div>
  );
}
