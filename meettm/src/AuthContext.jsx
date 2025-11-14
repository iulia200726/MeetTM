import React, { createContext, useState, useContext, useEffect } from "react";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthenticated(!!firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Exemplu de login cu email/parola (poți adapta la ce folosești tu)
  const login = async (email, password) => {
    const auth = getAuth();
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged va actualiza automat isAuthenticated și user
  };

  const logout = async () => {
    const auth = getAuth();
    await signOut(auth);
    // onAuthStateChanged va actualiza automat isAuthenticated și user
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}