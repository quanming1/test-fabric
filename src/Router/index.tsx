import { createBrowserRouter } from "react-router-dom";
import TestPage from "../Pages/TestPage";
import TestPage111 from "../Pages/TestPage111";
import ZoomOnPointDemo from "../Pages/ZoomOnPointDemo";

const router = createBrowserRouter([
  {
    path: "/test",
    element: <TestPage />,
  },
  {
    path: "/zoom",
    element: <ZoomOnPointDemo />,
  },
  {
    path: "/fff",
    element: <TestPage111 />,
  },
]);

export default router;
