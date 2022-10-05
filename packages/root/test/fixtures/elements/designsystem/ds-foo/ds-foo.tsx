import register from 'preact-custom-element';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'ds-foo': FooProps;
    }
  }
}

interface FooProps {
  name: string;
}

function Foo(props: FooProps) {
  return <h1>Hello {props.name || 'world'}!</h1>;
}

register(Foo, 'ds-foo');
