import Link from "next/link";


export default function Home(){

return (

<div className="
min-h-screen
flex
items-center
justify-center
">

<div className="text-center">

<h1 className="
text-3xl
font-bold
">
Medical AI Assistant
</h1>


<p className="mt-4">
AI assistant for operating room
</p>


<Link
href="/login"
className="
mt-6
inline-block
bg-blue-600
text-white
px-6
py-3
rounded-xl
"
>
Start
</Link>


</div>

</div>

)

}