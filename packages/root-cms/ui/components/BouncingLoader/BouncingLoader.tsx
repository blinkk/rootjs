import './BouncingLoader.css';

interface BouncingLoaderProps {
  size?: number;
}

export function BouncingLoader(props: BouncingLoaderProps) {
  const {size = 14} = props;
  const width = size * 3.57;
  const height = size * 2;
  return (
    <div
      className="BouncingLoader"
      style={
        {
          '--dot-size': `${size}px`,
          width: `${width}px`,
          height: `${height}px`,
        } as React.CSSProperties
      }
    />
  );
}
