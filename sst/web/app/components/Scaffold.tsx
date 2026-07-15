// Placeholder for a screen that has not been built yet. Renders what the screen
// will be and what is left to do, so an unfinished route is obvious in the
// browser instead of looking like a broken page.
//
// Delete this component once the last route is implemented.
export function Scaffold({
  title,
  portedFrom,
  todo,
}: {
  title: string;
  portedFrom: string;
  todo: string[];
}) {
  return (
    <div className="scaffold">
      <div className="scaffold-badge">SCAFFOLD — NOT IMPLEMENTED</div>
      <h1 className="scaffold-title">{title}</h1>
      <p className="scaffold-from">
        Port from <code>{portedFrom}</code>
      </p>
      <ul className="scaffold-todo">
        {todo.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
