import {Badge, Tooltip} from '@mantine/core';
import {TranslationsDoc} from '../../utils/doc.js';
import {timeDiff} from '../../utils/time.js';

interface TranslationsStatusBadgesProps {
  translationsDoc: TranslationsDoc;
  tooltipPosition?: 'bottom' | 'top';
}

export function TranslationsStatusBadges(props: TranslationsStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const sys = props.translationsDoc?.sys || {};
  return (
    <div className="CollectionPage__collection__docsList__doc__content__header__badges">
      {(!sys.publishedAt ||
        !sys.modifiedAt ||
        sys.modifiedAt > sys.publishedAt) && (
        <Tooltip
          {...tooltipProps}
          label={`Modified ${timeDiff(sys.modifiedAt)} by ${sys.modifiedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'indigo', to: 'cyan'}}
          >
            Draft
          </Badge>
        </Tooltip>
      )}
      {!!sys.publishedAt && (
        <Tooltip
          {...tooltipProps}
          label={`Published ${timeDiff(sys.publishedAt)} by ${sys.publishedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'teal', to: 'lime', deg: 105}}
          >
            Published
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}
