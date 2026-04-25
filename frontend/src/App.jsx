import React, { useState, useEffect, createContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CreateAssignment from "./pages/CreateAssignment";
import AssignmentDetail from "./pages/AssignmentDetail";
import QuestionManagement from "./pages/QuestionManagement";
import RubricManagement from "./pages/RubricManagement";
import UploadAnswers from "./pages/UploadAnswers";
import EvaluationResults from "./pages/EvaluationResults";
import ReviewAnswers from "./pages/ReviewAnswers";
import Assignments from "./pages/Assignments";
import Results from "./pages/Results";
import Layout from "./components/Layout";

// Auth Context
export const AuthContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored token
    const token = localStorage.getItem("evalmate_token");
    const userData = localStorage.getItem("evalmate_user");

    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("evalmate_token", token);
    localStorage.setItem("evalmate_user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("evalmate_token");
    localStorage.removeItem("evalmate_user");
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/dashboard" /> : <Signup />} />

          {/* Protected Routes directly rendering Layout with children */}
          <Route path="/dashboard" element={user ? <Layout><Dashboard /></Layout> : <Navigate to="/login" />} />
          <Route path="/create-assignment" element={user ? <Layout><CreateAssignment /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId" element={user ? <Layout><AssignmentDetail /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId/questions" element={user ? <Layout><QuestionManagement /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId/rubrics" element={user ? <Layout><RubricManagement /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId/upload-answers" element={user ? <Layout><UploadAnswers /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId/results" element={user ? <Layout><EvaluationResults /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignment/:assignmentId/review" element={user ? <Layout><ReviewAnswers /></Layout> : <Navigate to="/login" />} />
          <Route path="/assignments" element={user ? <Layout><Assignments /></Layout> : <Navigate to="/login" />} />
          <Route path="/results" element={user ? <Layout><Results /></Layout> : <Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;