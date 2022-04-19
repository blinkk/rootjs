import Spacing from 'spacingjs/dist/spacing';
import {useEffect} from 'react';

interface MeasurementUtilityLayerProps {
  enabled: boolean;
}

export function MeasurementUtilityLayer(props: MeasurementUtilityLayerProps) {
  useEffect(() => {
    if (props.enabled) {
      Spacing.start();
    } else {
      Spacing.stop();
    }
  }, [props.enabled]);
  return () => Spacing.stop();
}
