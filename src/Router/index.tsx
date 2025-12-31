import { createBrowserRouter } from "react-router-dom";
import TestPage33 from "../Pages/TestPage33";

const router = createBrowserRouter([
 
  {
    path: "/fabric-basic",
    element: <TestPage33 />,
  },
]);

export default router;
