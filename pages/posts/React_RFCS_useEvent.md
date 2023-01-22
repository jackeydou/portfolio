---
title: React RFCS - useEvent
date: 2022/09/01
tag:  React
author: Jackey
---

## 概述

RFC链接：

[rfcs/0000-useevent.md at useevent · reactjs/rfcs](https://github.com/reactjs/rfcs/blob/useevent/text/0000-useevent.md)

useEvent 要解决一个问题：如何同时保持函数引用不变与访问到最新状态。

提案中的例子：

````tsx
function Chat() {
  const [text, setText] = useState('');

  const onClick = useEvent(() => {
    sendMessage(text);
  });

  return <SendButton onClick={onClick} />;
}
````

## 在useEvent出现之前是怎么处理的

想要保持 onClick 不变，那就需要使用useCallback将 onClick包装一下，然后将state上的数据同步一份在ref上这样才可以在 useCallback里面获取到最新的值

````tsx
function Chat() {
  const [text, setText] = useState('');
	const textRef = useRef('')
  const onClick = useCallback(() => {
    sendMessage(textRef.current);
  }, []);

	// setText(newText);
	// textRef.current = newText;

  return <SendButton onClick={onClick} />;
}
````

## 为什么要提出这样一个新的hook

### state和props变更可能会引起性能问题

我们在react组件中定义一个函数最常用的就是作为子组件的props传递给子组件，比如定义一个 onClick函数 在子组件点击的时候 触发回调给外面做一些业务逻辑。e.g.：

````tsx
function Chat() {
  const [text, setText] = useState('');

  const onClick = () => {
    sendMessage(text);
  };

  return <SendButton onClick={onClick} />;
}
````

但是在函数式组件中，上面的例子每一次触发Chat组件的re-render（props或state更新）都意味着onClick会被重新创建，函数的引用地址将改变，SendButton组件就算做了memo浅比较的处理（默认不传memo第二个参数比较函数的情况下）也无济于事，会触发 SendButton组件的re-render。

### useEffect不应该被重新触发

rfc中给出的例子：

````tsx
function Chat({ selectedRoom }) {
  const [muted, setMuted] = useState(false);
  const theme = useContext(ThemeContext);

  useEffect(() => {
    const socket = createSocket('/chat/' + selectedRoom);
    socket.on('connected', async () => {
      await checkConnection(selectedRoom);
      showToast(theme, 'Connected to ' + selectedRoom);
    });
    socket.on('message', (message) => {
      showToast(theme, 'New message: ' + message);
      if (!muted) {
        playSound();
      }
    });
    socket.connect();
    return () => socket.dispose();
  }, [selectedRoom, theme, muted]); // 🟡 Re-runs when any of them change
  // ...
}
````

在selectedRoom变化的时候会连接新的socket，在socket的connect和message事件，并展示一个toast，toast的内容来自于context和state，为了让useEffect能拿到最新的值必须把theme和muted作为useEffect的dependencies传入，每次muted和theme的更新都会让useEffect重新执行重新连接socket。

当有了useEvent之后，可以将socket的connect和message事件的回调函数用useEvent进行包装：

````tsx
function Chat({ selectedRoom }) {
  const [muted, setMuted] = useState(false);
  const theme = useContext(ThemeContext);

  // ✅ Stable identity
  const onConnected = useEvent(connectedRoom => {
    showToast(theme, 'Connected to ' + connectedRoom);
  });

  // ✅ Stable identity
  const onMessage = useEvent(message => {
    showToast(theme, 'New message: ' + message);
    if (!muted) {
      playSound();
    }
  });

  useEffect(() => {
    const socket = createSocket('/chat/' + selectedRoom);
    socket.on('connected', async () => {
      await checkConnection(selectedRoom);
      onConnected(selectedRoom);
    });
    socket.on('message', onMessage);
    socket.connect();
    return () => socket.disconnect();
  }, [selectedRoom]); // ✅ Re-runs only when the room changes
}
````

## 提案给出的可能的实现方式

````tsx
// (!) Approximate behavior

function useEvent(handler) {
  const handlerRef = useRef(null);

  // In a real implementation, this would run before layout effects
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  return useCallback((...args) => {
    // In a real implementation, this would throw if called during render
    const fn = handlerRef.current;
    return fn(...args);
  }, []);
}
````

有两个 In a real implementation 的注释需要我们关注一下：

1. In a real implementation, this would run before layout effects。react官方在真正实现useEvent的时候触发ref赋值的操作会早于useEffectLayout。这是为了保证函数在一个事件循环中被直接消费时，可能访问到旧的 Ref 值；
1. In a real implementation, this would throw if called during render。这个函数不能在render中执行，因为useEvent包裹的函数内部很有可能会触发props或state的更新，为了保证render数据的结果不被影响。

## 值得注意的点

### useEvent内获取的值是最新的，但不是实时的

提案中给出的方案的实现的话，其实是在每次都会生成一个最新的函数只不过用useCallback维持对外暴露的引用不变。所以每次拿到的是这次更新之后的一次快照，并不像 useCallback + useRef那样能一直获取到最新的值。e.g.

````tsx
function App() {
  const [count, setCount] = useState(0)

  const onClick = useEvent(async () => {
    console.log(count)
    await doSomethingAsync(1000)
    console.log(count)
  })

  return <Child onClick={onClick} />
}
````

上面的例子中 即使在 doSomethingAsync中更改count，这两次输出的count还是一致的。

### 为什么要提前到layoutEffect之前执行ref挂载

因为如果在值变更之后立即执行，那么拿到的会是旧的ref值（因为layoutEffect还没执行过，没有重新更新函数）
