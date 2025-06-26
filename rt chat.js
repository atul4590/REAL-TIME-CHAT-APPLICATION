import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Main App component for the chat application
function App() {
  // State variables
  const [messages, setMessages] = useState([]); // Stores chat messages
  const [newMessage, setNewMessage] = useState(''); // Stores the current message being typed
  const [userId, setUserId] = useState(null); // Stores the current user's ID
  const [db, setDb] = useState(null); // Stores the Firestore database instance
  const [auth, setAuth] = useState(null); // Stores the Firebase Auth instance
  const [isAuthReady, setIsAuthReady] = useState(false); // Tracks if authentication is ready

  const messagesEndRef = useRef(null); // Ref for auto-scrolling to the latest message

  // Initialize Firebase and set up authentication
  useEffect(() => {
    try {
      // Access global variables provided by the environment
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

      // Initialize Firebase app
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      // Authenticate user
      const authenticate = async () => {
        if (initialAuthToken) {
          await signInWithCustomToken(firebaseAuth, initialAuthToken);
        } else {
          await signInAnonymously(firebaseAuth);
        }
      };

      authenticate();

      // Listen for auth state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          // Set user ID; if authenticated, use UID; otherwise, generate a random one (for anonymous)
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // If no user, user is signed out or anonymous. Use a random ID for now.
          // Note: In a real app, you'd handle sign-in/sign-up more robustly.
          setUserId(crypto.randomUUID());
          setIsAuthReady(true);
        }
      });

      // Cleanup function for auth listener
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }, []); // Run only once on component mount

  // Fetch messages from Firestore in real-time
  useEffect(() => {
    if (db && isAuthReady && userId) {
      // Define the collection path for public chat messages
      // This path adheres to the Firestore security rules for public data
      const chatCollectionPath = `/artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/messages`;
      const messagesCollectionRef = collection(db, chatCollectionPath);

      // Create a query to get messages, ordered by timestamp
      // NOTE: `orderBy` is commented out as it can cause index issues in this environment.
      // Data will be sorted in memory instead.
      const q = query(messagesCollectionRef /*, orderBy('timestamp')*/);

      // Set up a real-time listener for messages
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort messages by timestamp in memory, as orderBy might cause issues
        fetchedMessages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        setMessages(fetchedMessages);
      }, (error) => {
        console.error("Error fetching messages:", error);
      });

      // Cleanup function for snapshot listener
      return () => unsubscribe();
    }
  }, [db, isAuthReady, userId]); // Re-run when db, auth readiness, or userId changes

  // Auto-scroll to the bottom of the chat whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending a new message
  const handleSendMessage = async (e) => {
    e.preventDefault(); // Prevent default form submission behavior

    if (newMessage.trim() === '' || !db || !userId) {
      return; // Don't send empty messages or if DB/user not ready
    }

    try {
      // Define the collection path for public chat messages
      const chatCollectionPath = `/artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/messages`;
      const messagesCollectionRef = collection(db, chatCollectionPath);

      // Add the new message to Firestore
      await addDoc(messagesCollectionRef, {
        text: newMessage,
        senderId: userId,
        timestamp: serverTimestamp(), // Use Firestore's server timestamp
      });
      setNewMessage(''); // Clear the input field after sending
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans antialiased">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 shadow-lg rounded-b-lg">
        <h1 className="text-3xl font-bold text-center">Real-time Chat</h1>
        {userId && (
          <p className="text-sm text-center mt-1">
            Your User ID: <span className="font-mono bg-blue-700 px-2 py-1 rounded-md text-xs">{userId}</span>
          </p>
        )}
      </header>

      {/* Chat Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            <p>No messages yet. Start chatting!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow-md ${
                  msg.senderId === userId
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none'
                }`}
              >
                <div className="font-semibold text-sm mb-1 opacity-90">
                  {msg.senderId === userId ? 'You' : `User: ${msg.senderId.substring(0, 8)}...`}
                </div>
                <p className="break-words">{msg.text}</p>
                <div className="text-xs mt-1 text-right opacity-75">
                  {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : 'Sending...'}
                </div>
              </div>
            </div>
          ))
        )}
        {/* Dummy div for scrolling to the latest message */}
        <div ref={messagesEndRef} />
      </main>

      {/* Message Input Form */}
      <form onSubmit={handleSendMessage} className="bg-white p-4 border-t border-gray-200 shadow-inner rounded-t-lg">
        <div className="flex space-x-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            disabled={!isAuthReady} // Disable input until auth is ready
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105
                       disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
            disabled={newMessage.trim() === '' || !isAuthReady} // Disable button if no message or auth not ready
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
