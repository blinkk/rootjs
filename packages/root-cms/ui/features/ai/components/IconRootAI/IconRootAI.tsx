import {IconRobot} from '@tabler/icons-preact';

export interface IconRootAIProps {
  className?: string;
  size?: number;
}

export function IconRootAI(props: IconRootAIProps) {
  return <IconRobot className={props.className} size={props.size} />;
}
