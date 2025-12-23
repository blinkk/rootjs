import {GetStaticProps} from '@blinkk/root';

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      message: 'Hello from getStaticProps!',
    },
  };
};

export default function PropsRoute(props: {message: string}) {
  return <h1>Props: {props.message}</h1>;
}
