import { createBrowserRouter } from "react-router-dom";
import TestPage33 from "../Pages/TestPage33";
import Page222 from "../Pages/page222";

const router = createBrowserRouter([
  {
    path: "/",
    element: <TestPage33 />,
  },
  {
    path: "/video-test",
    element: <Page222 />,
  },
]);

export default router;
