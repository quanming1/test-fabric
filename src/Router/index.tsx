import { createBrowserRouter } from "react-router-dom";
import TestPage33 from "../Pages/TestPage33";
import Page222 from "../Pages/page222";

const router = createBrowserRouter([
  {
    path: "/fabric-basic",
    element: <TestPage33 />,
  },
  {
    path: "/page222",
    element: <Page222 />,
  },
]);

export default router;
