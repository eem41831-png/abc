import java.sql.*;

public class Database {
    public static void main(String[] args) {

        // Using H2 embedded database (MySQL-compatible, no server needed)
        String url = "jdbc:h2:./srmist;MODE=MySQL;DATABASE_TO_LOWER=TRUE";
        String user = "root";
        String password = "";

        try {
             
            Class.forName("org.h2.Driver");

            
            Connection con =
                DriverManager.getConnection(url, user, password);

             
            Statement stmt = con.createStatement();

           
            stmt.executeUpdate(
                "CREATE TABLE IF NOT EXISTS emp (name VARCHAR(50), dept VARCHAR(30))"
            );

          
            int result = stmt.executeUpdate(
                "INSERT INTO emp VALUES ('RAJESH', 'CSE')"
            );

            if (result > 0) {
                System.out.println("Successfully inserted");
            }
 
            ResultSet rs = stmt.executeQuery("SELECT * FROM emp");

            while (rs.next()) {
                System.out.println(
                    rs.getString(1) + " " + rs.getString(2)
                );
            }

            // 7. Close resources
            rs.close();
            stmt.close();
            con.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
