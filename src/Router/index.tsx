import { createBrowserRouter } from "react-router-dom";
import TestPage from "../Pages/TestPage";
import TestPage111 from "../Pages/TestPage111";
import TestPage222 from "../Pages/TestPage222";
import TestPage33 from "../Pages/TestPage33";
import ZoomOnPointDemo from "../Pages/ZoomOnPointDemo";

const router = createBrowserRouter([
  {
    path: "/test",
    element: <TestPage />,
  },
  {
    path: "/fabric-basic",
    element: <TestPage33 />,
  },
  {
    path: "/zoom",
    element: <ZoomOnPointDemo />,
  },
  {
    path: "/fff",
    element: <TestPage111 />,
  },
  {
    path: "/test222",
    element: <TestPage222 />,
  },
]);

export default router;
