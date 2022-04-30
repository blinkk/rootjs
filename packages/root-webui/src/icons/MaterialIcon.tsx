interface MaterialIconProps {
  icon: string;
}

export function MaterialIcon(props: MaterialIconProps) {
  return <div className="material-symbols-rounded">{props.icon}</div>;
}
