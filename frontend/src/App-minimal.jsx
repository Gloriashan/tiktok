import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function TestPage() {
  return <div style={{ padding: 40, fontSize: 24 }}>React is working!</div>
}

function HomeRoute() {
  return <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/auth" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  )
}
