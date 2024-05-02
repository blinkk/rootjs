import {CSSProperties} from 'preact/compat';
import {Container} from '@/components/Container/Container.js';
import {DividerFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './Divider.module.scss';

export function Divider(props: DividerFields) {
  const style: CSSProperties = {};
  const spacer = props.spacer || {};
  style['--spacer-size--desktop'] = `${spacer.desktopHeight || '0'}px`;
  style['--spacer-size--tablet'] = `${
    spacer.tabletHeight || spacer.desktopHeight || '0'
  }px`;
  style['--spacer-size--mobile'] = `${
    spacer.mobileHeight || spacer.tabletHeight || spacer.desktopHeight || '0'
  }px`;
  return (
    <div
      className={joinClassNames(
        styles.divider,
        styles[`color:${props.color || 'default'}`]
      )}
      style={style}
      role="separator"
      aria-hidden={true}
    >
      <Container className={styles.container}>
        <svg
          className={styles.svg}
          width="246"
          height="6"
          viewBox="0 0 246 6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21.268 4.51637C30.9095 4.68364 40.551 4.89274 50.1925 5.06001C60.4011 5.22729 70.6098 5.22729 80.8184 5.39457C92.1614 5.60366 103.788 5.39457 115.414 5.47821C131.578 5.56184 147.458 5.14365 163.338 5.14365C164.756 5.14365 166.174 5.06001 167.592 5.0182C178.368 4.72546 188.86 4.39091 199.636 4.18181C212.68 3.9309 224.874 3.34543 237.067 2.75996C240.754 2.59269 243.59 2.21631 245.858 1.71448C245.858 1.42175 246.425 1.0872 245.291 0.752645C243.59 0.376272 241.037 0.125358 237.351 -0.000100136C235.366 0.250814 233.097 0.543549 231.112 0.794464C228.277 0.96174 225.157 0.878102 222.322 1.04538C209.561 1.7563 196.233 2.00722 182.621 1.92358C179.218 1.92358 175.532 1.88176 172.129 2.00722C166.741 2.25813 161.353 2.25813 156.249 2.13268C146.04 1.88176 135.832 1.9654 125.623 1.9654C118.534 1.9654 111.444 2.00722 104.922 1.54721C102.654 1.37993 100.101 1.46357 97.8329 1.46357C95.2807 1.46357 92.445 1.50539 89.8928 1.46357C73.4455 1.12902 57.2818 0.501729 40.551 0.167177C26.3723 -0.125557 14.1787 -0.0837379 5.10432 1.71448C4.25359 1.88176 3.11932 2.00722 1.98502 2.17449C1.70143 2.67632 1.70144 3.17815 0 3.59634C1.70144 3.88908 3.11931 4.09817 5.95505 4.30727C11.3429 4.13999 16.4473 4.43273 21.5516 4.51637H21.268Z"
            fill="#202124"
          />
        </svg>
      </Container>
    </div>
  );
}
